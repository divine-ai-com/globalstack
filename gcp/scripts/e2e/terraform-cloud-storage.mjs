import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { listen } from '../../src/server/server.mjs';

const templateDir = new URL('../../templates/terraform/cloud-storage/', import.meta.url);

function parseArgs(argv) {
  const args = {
    terraform: process.env.TERRAFORM_BIN ?? '/home/ubuntu/.local/bin/terraform',
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    if (arg.startsWith('--terraform=')) {
      args.terraform = arg.slice('--terraform='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const runId = createRunId('tf-storage');
const bucketName = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
const objectName = `artifacts/${runId}/sample.json`;
const workdir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-tf-storage-'));
const runtime = await listen({ port: 0 });
const commands = [];
let status = 'passed';
let planExitCode = null;

try {
  await copyTemplate(workdir);
  const vars = [
    `project_id=globalstack-local`,
    `bucket_name=${bucketName}`,
    `object_name=${objectName}`,
    `object_content={run_id="${runId}",purpose="globalstack gcp terraform"}`,
    `labels={purpose="globalstack-conformance",owner="globalstack",run_id="${runId}"}`,
    `storage_endpoint=${runtime.url}/storage/v1/`,
  ];

  await runTerraform(['init', '-input=false'], { workdir, commands });
  await runTerraform(['apply', '-input=false', '-auto-approve', ...varArgs(vars)], { workdir, commands });
  const plan = await runTerraform(['plan', '-input=false', '-detailed-exitcode', ...varArgs(vars)], {
    workdir,
    commands,
    allowedExitCodes: [0, 2],
  });
  planExitCode = plan.exitCode;
  if (plan.exitCode !== 0) {
    throw new Error(`Terraform plan reported drift with detailed exit code ${plan.exitCode}`);
  }
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
  const destroyVars = [
    `project_id=globalstack-local`,
    `bucket_name=${bucketName}`,
    `object_name=${objectName}`,
    `object_content={run_id="${runId}",purpose="globalstack gcp terraform"}`,
    `labels={purpose="globalstack-conformance",owner="globalstack",run_id="${runId}"}`,
    `storage_endpoint=${runtime.url}/storage/v1/`,
  ];
  await runTerraform(['destroy', '-input=false', '-auto-approve', ...varArgs(destroyVars)], {
    workdir,
    commands,
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
  await runtime.close();
  if (!args.keepWorkdir) {
    await rm(workdir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  status,
  terraform: args.terraform,
  run_id: runId,
  bucket_name: bucketName,
  object_name: objectName,
  endpoint: `${runtime.url}/storage/v1/`,
  plan_exit_code: planExitCode,
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
  for (const file of files.filter(file => file.endsWith('.tf'))) {
    await copyFile(new URL(file, templateDir), join(workdir, file));
  }
}

function varArgs(vars) {
  return vars.flatMap(value => ['-var', value]);
}

function runTerraform(terraformArgs, { workdir, commands, allowedExitCodes = [0] }) {
  const name = terraformArgs[0];
  return new Promise((resolve, reject) => {
    execFile(args.terraform, terraformArgs, {
      cwd: workdir,
      env: {
        ...process.env,
        TF_IN_AUTOMATION: '1',
      },
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
        reject(new Error(`${args.terraform} ${terraformArgs.join(' ')} failed with ${exitCode}\n${stdout}${stderr}`));
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
