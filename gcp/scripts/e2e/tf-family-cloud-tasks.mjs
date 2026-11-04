import { execFile } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { CloudTasksApi } from '../../src/services/cloud-tasks/google-api.mjs';

const templateDir = new URL('../../templates/terraform/cloud-tasks/', import.meta.url);

export async function runCloudTasksLifecycle({
  argv,
  cliName,
  binaryArg,
  binaryEnv,
  defaultBinary,
  runIdPrefix,
}) {
  const args = parseArgs(argv, { binaryArg, binaryEnv, defaultBinary });
  const runId = createRunId(runIdPrefix);
  const location = 'us-central1';
  const queueId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
  const taskId = 'dispatch-workflow';
  const workdir = await mkdtemp(join(tmpdir(), `globalstack-gcp-${runIdPrefix}-`));
  const runtime = await listen({ port: 0 });
  const receiver = await startReceiver();
  const api = new CloudTasksApi(new GoogleRestClient({ tokenProvider: async () => null }), {
    tasksRoot: `${runtime.url}/v2`,
  });
  const commands = [];
  let status = 'passed';
  let planExitCode = null;
  let dispatchCheck = 'not-run';

  try {
    await copyTemplate(workdir);
    const vars = buildVars({ queueId, runtime });

    await runCommand(args.binary, ['init', '-input=false'], { workdir, commands });
    await runCommand(args.binary, ['apply', '-input=false', '-auto-approve', ...varArgs(vars)], {
      workdir,
      commands,
    });

    await api.createHttpTask({
      projectId: 'globalstack-local',
      location,
      queueId,
      taskId,
      url: `${receiver.url}/tasks`,
      headers: {
        'content-type': 'application/json',
        'x-run-id': runId,
      },
      body: JSON.stringify({
        run_id: runId,
        action: 'dispatch',
      }),
    });
    const runTask = await api.runTask({ projectId: 'globalstack-local', location, queueId, taskId });
    const delivery = await receiver.nextDelivery();
    if (runTask.response.body.status !== 'SUCCEEDED' || delivery.headers['x-run-id'] !== runId) {
      throw new Error(`Cloud Tasks dispatch check failed for ${runId}`);
    }
    dispatchCheck = 'passed';

    const plan = await runCommand(args.binary, ['plan', '-input=false', '-detailed-exitcode', ...varArgs(vars)], {
      workdir,
      commands,
      allowedExitCodes: [0, 2],
    });
    planExitCode = plan.exitCode;
    if (plan.exitCode !== 0) {
      throw new Error(`${cliName} plan reported drift with detailed exit code ${plan.exitCode}`);
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
    const destroyVars = buildVars({ queueId, runtime });
    const destroyResult = await runCommand(args.binary, ['destroy', '-input=false', '-auto-approve', ...varArgs(destroyVars)], {
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
      return null;
    });
    if (destroyResult && destroyResult.exitCode !== 0) {
      status = 'failed';
      process.exitCode = 1;
    }
    await receiver.close();
    await runtime.close();
    if (!args.keepWorkdir) {
      await rm(workdir, { recursive: true, force: true });
    }
  }

  console.log(JSON.stringify({
    status,
    [cliName]: args.binary,
    run_id: runId,
    location,
    queue_id: queueId,
    task_id: taskId,
    endpoint: `${runtime.url}/v2/`,
    dispatch_check: dispatchCheck,
    plan_exit_code: planExitCode,
    workdir: args.keepWorkdir ? workdir : null,
    commands: commands.map(command => ({
      name: command.name,
      exit_code: command.exit_code,
      stdout_tail: tail(command.stdout),
      stderr_tail: tail(command.stderr),
    })),
  }, null, 2));
}

function parseArgs(argv, { binaryArg, binaryEnv, defaultBinary }) {
  const args = {
    binary: process.env[binaryEnv] ?? defaultBinary,
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    if (arg.startsWith(`--${binaryArg}=`)) {
      args.binary = arg.slice(`--${binaryArg}=`.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function copyTemplate(workdir) {
  const files = await readdir(templateDir);
  for (const file of files.filter(file => file.endsWith('.tf'))) {
    await copyFile(new URL(file, templateDir), join(workdir, file));
  }
}

function buildVars({ queueId, runtime }) {
  return [
    'project_id=globalstack-local',
    'location=us-central1',
    `queue_id=${queueId}`,
    `cloud_tasks_endpoint=${runtime.url}/v2/`,
  ];
}

function varArgs(vars) {
  return vars.flatMap(value => ['-var', value]);
}

function runCommand(binary, commandArgs, { workdir, commands, allowedExitCodes = [0] }) {
  const name = commandArgs[0];
  return new Promise((resolve, reject) => {
    execFile(binary, commandArgs, {
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
        reject(new Error(`${binary} ${commandArgs.join(' ')} failed with ${exitCode}\n${stdout}${stderr}`));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function startReceiver() {
  const deliveries = [];
  const waiters = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/tasks') {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const delivery = {
      headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    };
    deliveries.push(delivery);
    waiters.shift()?.(delivery);
    response.writeHead(204);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    nextDelivery() {
      if (deliveries.length) return Promise.resolve(deliveries.shift());
      return new Promise(resolve => waiters.push(resolve));
    },
    close() {
      return new Promise(resolve => server.close(resolve));
    },
  };
}

function tail(text, maxLength = 3000) {
  if (!text) return '';
  return text.length <= maxLength ? text : text.slice(-maxLength);
}
