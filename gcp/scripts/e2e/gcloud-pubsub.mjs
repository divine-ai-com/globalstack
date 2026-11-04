import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { startPubSubEmulator } from '../../src/services/pubsub/emulator-engine.mjs';

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
const runId = createRunId('gcloud-pubsub');
const topicName = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
const subscriptionName = `gst-sub-${runId}`.slice(0, 255).replace(/-+$/g, '');
const projectId = 'globalstack-local';
const workdir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-gcloud-pubsub-'));
const configDir = join(workdir, 'cloudsdk');
const emulator = await startPubSubEmulator();
const commands = [];
let status = 'passed';
let subscriptionCreated = false;
let topicCreated = false;

try {
  const env = gcloudEnv(configDir);

  await runGcloud(['config', 'set', 'core/project', projectId], { commands, env });
  await runGcloud(['config', 'set', 'auth/disable_credentials', 'true'], { commands, env });
  await runGcloud(['config', 'set', 'api_endpoint_overrides/pubsub', `http://${emulator.endpoint}/`], {
    commands,
    env,
  });
  await runGcloud(['pubsub', 'topics', 'create', topicName], { commands, env });
  topicCreated = true;
  await runGcloud([
    'pubsub',
    'subscriptions',
    'create',
    subscriptionName,
    `--topic=${topicName}`,
    '--ack-deadline=20',
    '--message-retention-duration=7d',
  ], { commands, env });
  subscriptionCreated = true;
  await runGcloud([
    'pubsub',
    'topics',
    'publish',
    topicName,
    `--message=${JSON.stringify({ run_id: runId, source: 'gcloud' })}`,
    `--attribute=run_id=${runId},purpose=globalstack-conformance`,
  ], { commands, env });
  const pull = await runGcloud([
    'pubsub',
    'subscriptions',
    'pull',
    subscriptionName,
    '--auto-ack',
    '--limit=1',
    '--format=json',
  ], { commands, env });
  const messages = JSON.parse(pull.stdout || '[]');
  const pulledMessage = messages.at(0)?.message;
  if (!pulledMessage) {
    throw new Error('gcloud pubsub subscriptions pull returned no messages');
  }
  const payload = JSON.parse(Buffer.from(pulledMessage.data ?? '', 'base64').toString('utf8'));
  if (payload.run_id !== runId) {
    throw new Error(`pulled Pub/Sub message did not include run id ${runId}`);
  }
  if (pulledMessage.attributes?.run_id !== runId || pulledMessage.attributes?.purpose !== 'globalstack-conformance') {
    throw new Error('pulled Pub/Sub message attributes did not match published attributes');
  }
  await runGcloud(['pubsub', 'subscriptions', 'delete', subscriptionName, '--quiet'], { commands, env });
  subscriptionCreated = false;
  await runGcloud(['pubsub', 'topics', 'delete', topicName, '--quiet'], { commands, env });
  topicCreated = false;
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
  if (subscriptionCreated) {
    await runGcloud(['pubsub', 'subscriptions', 'delete', subscriptionName, '--quiet'], {
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
      commands.push({ name: 'cleanup-subscription-error', exit_code: 1, stdout: '', stderr: error.message });
    });
  }
  if (topicCreated) {
    await runGcloud(['pubsub', 'topics', 'delete', topicName, '--quiet'], {
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
      commands.push({ name: 'cleanup-topic-error', exit_code: 1, stdout: '', stderr: error.message });
    });
  }
  await emulator.stop();
  if (!args.keepWorkdir) {
    await rm(workdir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  status,
  gcloud: args.gcloud,
  project_id: projectId,
  run_id: runId,
  topic_name: topicName,
  subscription_name: subscriptionName,
  emulator_host: emulator.endpoint,
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
    ...emulator.env,
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
