import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { startPubSubEmulator } from '../../src/services/pubsub/emulator-engine.mjs';

const templateDir = new URL('../../templates/sdk/nodejs/pubsub/', import.meta.url);

function parseArgs(argv) {
  const args = {
    keepWorkdir: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-workdir') {
      args.keepWorkdir = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const runId = createRunId('sdk-node-pubsub');
const topicName = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
const subscriptionName = `gst-sub-${runId}`.slice(0, 255).replace(/-+$/g, '');
const workdir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-sdk-node-pubsub-'));
const emulator = await startPubSubEmulator();
const commands = [];
let status = 'passed';

try {
  await copyTemplate(workdir);
  const env = {
    ...process.env,
    ...emulator.env,
    RUN_ID: runId,
    TOPIC_NAME: topicName,
    SUBSCRIPTION_NAME: subscriptionName,
  };
  await runCommand('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { workdir, commands, env });
  await runCommand('node', ['index.cjs'], { workdir, commands, env, name: 'node sdk lifecycle' });
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
  await emulator.stop();
  if (!args.keepWorkdir) {
    await rm(workdir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  status,
  sdk: '@google-cloud/pubsub',
  sdk_version: '5.3.0',
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

async function copyTemplate(workdir) {
  const files = await readdir(templateDir);
  for (const file of files.filter(file => ['.cjs', '.json'].some(extension => file.endsWith(extension)))) {
    await copyFile(new URL(file, templateDir), join(workdir, file));
  }
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
