import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { listen } from '../../src/server/server.mjs';

const templateDir = new URL('../../templates/pulumi/cloud-storage/', import.meta.url);

function parseArgs(argv) {
  const args = {
    pulumi: process.env.PULUMI_BIN ?? '/home/ubuntu/.local/bin/pulumi',
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    if (arg.startsWith('--pulumi=')) {
      args.pulumi = arg.slice('--pulumi='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const runId = createRunId('pulumi-storage');
const stackName = `dev-${runId}`;
const bucketName = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
const objectName = `artifacts/${runId}/sample.json`;
const workdir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-pulumi-storage-'));
const backendDir = join(workdir, 'backend');
const runtime = await listen({ port: 0 });
const commands = [];
let status = 'passed';

try {
  await mkdir(backendDir, { recursive: true });
  await copyTemplate(workdir);
  const env = pulumiEnv(backendDir, {
    GOOGLE_COMPUTE_CUSTOM_ENDPOINT: `${runtime.url}/compute/v1/`,
    GOOGLE_STORAGE_CUSTOM_ENDPOINT: `${runtime.url}/storage/v1/`,
  });

  await runCommand('npm', ['install', '--no-audit', '--no-fund'], { workdir, commands, env });
  await runPulumi(['login', `file://${backendDir}`], { workdir, commands, env });
  await runPulumi(['stack', 'init', stackName, '--non-interactive'], { workdir, commands, env });
  await setConfig({ workdir, commands, env, key: 'projectId', value: 'globalstack-local' });
  await setConfig({ workdir, commands, env, key: 'bucketName', value: bucketName });
  await setConfig({ workdir, commands, env, key: 'objectName', value: objectName });
  await setConfig({ workdir, commands, env, key: 'runId', value: runId });
  await setConfig({ workdir, commands, env, key: 'storageEndpoint', value: `${runtime.url}/storage/v1/` });
  await setConfig({ workdir, commands, env, key: 'computeEndpoint', value: `${runtime.url}/compute/v1/` });

  await runPulumi(['up', '--yes', '--skip-preview', '--non-interactive', '--stack', stackName], {
    workdir,
    commands,
    env,
  });
  await runPulumi(['preview', '--expect-no-changes', '--non-interactive', '--stack', stackName], {
    workdir,
    commands,
    env,
  });
} catch (error) {
  status = 'failed';
  commands.push({
    name: 'error',
    exit_code: 1,
    stdout: '',
    stderr: error.message,
  });
  process.exitCode = 1;
} finally {
  let destroyResult = null;
  destroyResult = await runPulumi(['destroy', '--yes', '--skip-preview', '--non-interactive', '--stack', stackName], {
    workdir,
    commands,
    env: pulumiEnv(backendDir, {
      GOOGLE_COMPUTE_CUSTOM_ENDPOINT: `${runtime.url}/compute/v1/`,
      GOOGLE_STORAGE_CUSTOM_ENDPOINT: `${runtime.url}/storage/v1/`,
    }),
    allowedExitCodes: [0, 1],
  }).catch(error => {
    status = 'failed';
    process.exitCode = 1;
    commands.push({
      name: 'destroy-error',
      exit_code: 1,
      stdout: '',
      stderr: error.message,
    });
  });
  if (destroyResult && destroyResult.exitCode !== 0) {
    status = 'failed';
    process.exitCode = 1;
  }
  await runtime.close();
  if (!args.keepWorkdir) {
    await rm(workdir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  status,
  pulumi: args.pulumi,
  run_id: runId,
  stack_name: stackName,
  bucket_name: bucketName,
  object_name: objectName,
  endpoint: `${runtime.url}/storage/v1/`,
  compute_endpoint: `${runtime.url}/compute/v1/`,
  workdir: args.keepWorkdir ? workdir : null,
  commands: commands.map(command => ({
    name: command.name,
    exit_code: command.exit_code,
    stdout_tail: tail(command.stdout),
    stderr_tail: tail(command.stderr),
  })),
}, null, 2));

async function copyTemplate(workdir) {
  const files = await readdir(templateDir);
  for (const file of files.filter(file => ['.yaml', '.js', '.json'].some(extension => file.endsWith(extension)))) {
    await copyFile(new URL(file, templateDir), join(workdir, file));
  }
}

async function setConfig({ workdir, commands, env, key, value }) {
  await runPulumi(['config', 'set', key, value, '--non-interactive', '--stack', stackName], {
    workdir,
    commands,
    env,
  });
}

function pulumiEnv(backendDir, extra = {}) {
  return {
    ...process.env,
    ...extra,
    PULUMI_BACKEND_URL: `file://${backendDir}`,
    PULUMI_CONFIG_PASSPHRASE: '',
  };
}

function runPulumi(pulumiArgs, { workdir, commands, env, allowedExitCodes = [0] }) {
  const name = pulumiArgs.slice(0, 2).join(' ');
  return runCommand(args.pulumi, pulumiArgs, { workdir, commands, env, allowedExitCodes, name });
}

function runCommand(file, commandArgs, { workdir, commands, env, allowedExitCodes = [0], name = commandArgs.slice(0, 2).join(' ') }) {
  return new Promise((resolve, reject) => {
    execFile(file, commandArgs, {
      cwd: workdir,
      env,
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const exitCode = error?.code ?? 0;
      commands.push({
        name,
        exit_code: exitCode,
        stdout,
        stderr,
      });
      if (!allowedExitCodes.includes(exitCode)) {
        reject(new Error(`${file} ${commandArgs.join(' ')} failed with ${exitCode}\n${stdout}${stderr}`));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function tail(text, maxLength = 3000) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(-maxLength);
}
