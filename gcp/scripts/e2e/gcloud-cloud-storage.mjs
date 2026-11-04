import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { listen } from '../../src/server/server.mjs';

function parseArgs(argv) {
  const args = {
    gcloud: process.env.GCLOUD_BIN ?? 'gcloud',
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    if (arg.startsWith('--gcloud=')) {
      args.gcloud = arg.slice('--gcloud='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const runId = createRunId('gcloud-storage');
const bucketName = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
const bucketUrl = `gs://${bucketName}`;
const objectName = `artifacts/${runId}/sample.json`;
const objectUrl = `${bucketUrl}/${objectName}`;
const workdir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-gcloud-storage-'));
const samplePath = join(workdir, 'sample.json');
const configDir = join(workdir, 'cloudsdk');
const runtime = await listen({ port: 0 });
const commands = [];
let status = 'passed';
let objectUploaded = false;
let bucketCreated = false;

try {
  await writeFile(samplePath, `${JSON.stringify({ run_id: runId, purpose: 'globalstack gcp gcloud' })}\n`);
  const env = gcloudEnv(configDir);

  await runGcloud(['config', 'set', 'core/project', 'globalstack-local'], { commands, env });
  await runGcloud(['config', 'set', 'auth/disable_credentials', 'true'], { commands, env });
  await runGcloud(['config', 'set', 'api_endpoint_overrides/storage', `${runtime.url}/storage/v1/`], {
    commands,
    env,
  });
  await runGcloud(['storage', 'buckets', 'create', bucketUrl, '--location=US', '--uniform-bucket-level-access'], {
    commands,
    env,
  });
  bucketCreated = true;
  await runGcloud(['storage', 'cp', samplePath, objectUrl], { commands, env });
  objectUploaded = true;
  const listing = await runGcloud(['storage', 'ls', `${bucketUrl}/**`], { commands, env });
  if (!listing.stdout.includes(objectUrl)) {
    throw new Error(`gcloud storage ls did not include ${objectUrl}`);
  }
  await runGcloud(['storage', 'rm', objectUrl], { commands, env });
  objectUploaded = false;
  await runGcloud(['storage', 'buckets', 'delete', bucketUrl, '--quiet'], { commands, env });
  bucketCreated = false;
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
  const env = gcloudEnv(configDir);
  if (objectUploaded) {
    await runGcloud(['storage', 'rm', objectUrl, '--quiet'], {
      commands,
      env,
      allowedExitCodes: [0, 1],
    }).then(result => {
      if (result.exitCode !== 0) {
        status = 'failed';
        process.exitCode = 1;
      }
    }).catch(error => {
      status = 'failed';
      process.exitCode = 1;
      commands.push({ name: 'cleanup-rm-error', exit_code: 1, stdout: '', stderr: error.message });
    });
  }
  if (bucketCreated) {
    await runGcloud(['storage', 'buckets', 'delete', bucketUrl, '--quiet'], {
      commands,
      env,
      allowedExitCodes: [0, 1],
    }).then(result => {
      if (result.exitCode !== 0) {
        status = 'failed';
        process.exitCode = 1;
      }
    }).catch(error => {
      status = 'failed';
      process.exitCode = 1;
      commands.push({ name: 'cleanup-delete-error', exit_code: 1, stdout: '', stderr: error.message });
    });
  }
  await runtime.close();
  if (!args.keepWorkdir) {
    await rm(workdir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  status,
  gcloud: args.gcloud,
  run_id: runId,
  bucket_name: bucketName,
  object_name: objectName,
  endpoint: `${runtime.url}/storage/v1/`,
  workdir: args.keepWorkdir ? workdir : null,
  commands: commands.map(command => ({
    name: command.name,
    exit_code: command.exit_code,
    stdout_tail: tail(command.stdout),
    stderr_tail: tail(command.stderr),
  })),
}, null, 2));

function gcloudEnv(configDir) {
  return {
    ...process.env,
    CLOUDSDK_CONFIG: configDir,
    CLOUDSDK_CORE_DISABLE_PROMPTS: '1',
    CLOUDSDK_CORE_VERBOSITY: 'error',
    CLOUDSDK_METRICS_ENVIRONMENT: 'globalstack-gcp-conformance',
  };
}

function runGcloud(gcloudArgs, { commands, env, allowedExitCodes = [0] }) {
  const name = gcloudArgs.slice(0, 3).join(' ');
  return new Promise((resolve, reject) => {
    execFile(args.gcloud, gcloudArgs, {
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
        reject(new Error(`${args.gcloud} ${gcloudArgs.join(' ')} failed with ${exitCode}\n${stdout}${stderr}`));
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
