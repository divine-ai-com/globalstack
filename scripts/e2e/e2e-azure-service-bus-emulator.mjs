import { markdownCell } from '../../packages/workspace-utils/src/markdown-cell.mjs';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { ServiceBusClient } from '@azure/service-bus';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-service-bus');
const composePath = join(root, 'dist', 'hybrid', 'docker-compose.official-emulators.yml');
const connectionString = 'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;';
const serviceBusHttpPort = Number(process.env.GLOBALSTACK_SERVICEBUS_HTTP_PORT ?? '5300');

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      env: {
        ...process.env,
        GLOBALSTACK_MSSQL_PASSWORD: process.env.GLOBALSTACK_MSSQL_PASSWORD ?? 'GlobalStack!12345',
        GLOBALSTACK_SERVICEBUS_HTTP_PORT: process.env.GLOBALSTACK_SERVICEBUS_HTTP_PORT ?? '5300',
        GLOBALSTACK_SERVICEBUS_SQL_WAIT_INTERVAL: process.env.GLOBALSTACK_SERVICEBUS_SQL_WAIT_INTERVAL ?? '30',
      },
      stdio: opts.stdio ?? 'pipe',
    });
    const timeoutMs = opts.timeoutMs ?? 180000;
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms` });
    }, timeoutMs);
    if (child.stdout) child.stdout.on('data', chunk => { stdout += chunk; });
    if (child.stderr) child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore', timeoutMs: 30000 });
  if (direct.code === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore', timeoutMs: 30000 });
  if (sudo.code === 0) return { command: 'sudo', prefix: ['-n', 'docker'] };
  throw new Error('Docker is required for the Service Bus emulator E2E test but is not available.');
}

async function compose(docker, args, opts = {}) {
  return run(docker.command, [
    ...docker.prefix,
    'compose',
    '-f',
    composePath,
    '--profile',
    'service-bus-emulator',
    ...args,
  ], opts);
}

async function down(docker) {
  await compose(docker, ['down', '-v', '--remove-orphans'], { stdio: 'ignore', timeoutMs: 120000 });
}

async function up(docker) {
  await down(docker);
  const result = await compose(docker, ['up', '-d'], { timeoutMs: 240000 });
  if (result.code !== 0) {
    throw new Error(`Failed to start Service Bus emulator: ${result.stderr || result.stdout}`);
  }
}

async function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForHealth(timeoutMs = 300000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    if (await portOpen(serviceBusHttpPort)) {
      const result = await run('curl', [
        '-fsS',
        '--max-time',
        '5',
        `http://127.0.0.1:${serviceBusHttpPort}/health`,
      ], { timeoutMs: 10000 });
      if (result.code === 0) return { status: 200, body: result.stdout };
      lastError = `${result.stderr || result.stdout || `curl exited ${result.code}`}`.trim();
    } else {
      lastError = `port ${serviceBusHttpPort} is not open yet`;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`Service Bus emulator health endpoint did not become ready: ${lastError}`);
}

function markdown(report) {
  const lines = [
    '# Azure Service Bus Emulator E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '| Step | Status | Detail |',
    '|---|---|---|',
  ];
  for (const step of report.steps) {
    lines.push(`| ${step.name} | ${step.ok ? 'pass' : 'fail'} | ${markdownCell(step.detail)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function errorDetail(error) {
  if (!(error instanceof Error)) return String(error);
  return `${error.message}${error.stack ? `\n${error.stack}` : ''}`;
}

await mkdir(outRoot, { recursive: true });

const docker = await dockerCommand();
const steps = [];
let ok = false;

async function record(name, fn) {
  try {
    const detail = await fn();
    steps.push({ name, ok: true, detail });
    console.log(`PASS ${name}: ${detail}`);
    return detail;
  } catch (error) {
    const detail = errorDetail(error);
    steps.push({ name, ok: false, detail });
    console.log(`FAIL ${name}: ${detail}`);
    throw error;
  }
}

try {
  await record('start service bus emulator compose profile', async () => {
    await up(docker);
    return 'service-bus-emulator and SQL Server containers requested';
  });

  await record('wait for service bus health endpoint', async () => {
    const health = await waitForHealth();
    return `HTTP ${health.status} ${health.body.slice(0, 120).replace(/\s+/g, ' ')}`;
  });

  const client = new ServiceBusClient(connectionString);
  try {
    const suffix = Date.now().toString(36);
    const queueMessage = { body: { scenario: 'globalstack-service-bus-queue', suffix }, messageId: `queue-${suffix}` };
    const topicMessage = { body: { scenario: 'globalstack-service-bus-topic', suffix }, messageId: `topic-${suffix}` };

    await record('queue send and receive configured entity', async () => {
      const sender = client.createSender('robot-telemetry');
      const receiver = client.createReceiver('robot-telemetry');
      try {
        await sender.sendMessages(queueMessage);
        const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(messages.length, 1);
        assert.equal(messages[0].messageId, queueMessage.messageId);
        await receiver.completeMessage(messages[0]);
        return `received message ${messages[0].messageId}`;
      } finally {
        await sender.close();
        await receiver.close();
      }
    });

    await record('completed queue message is removed from active delivery', async () => {
      const receiver = client.createReceiver('robot-telemetry');
      try {
        const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 3000 });
        assert.equal(messages.length, 0);
        return 'queue returned no active messages after completion';
      } finally {
        await receiver.close();
      }
    });

    await record('abandoned queue message is redelivered', async () => {
      const sender = client.createSender('robot-telemetry');
      const receiver = client.createReceiver('robot-telemetry');
      const messageId = `abandon-${suffix}`;
      try {
        await sender.sendMessages({ body: { scenario: 'abandon-redelivery', suffix }, messageId });
        const first = await receiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(first.length, 1);
        assert.equal(first[0].messageId, messageId);
        await receiver.abandonMessage(first[0]);
        const second = await receiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(second.length, 1);
        assert.equal(second[0].messageId, messageId);
        await receiver.completeMessage(second[0]);
        return `redelivered message ${messageId}`;
      } finally {
        await sender.close();
        await receiver.close();
      }
    });

    await record('duplicate queue message ids are delivered when duplicate detection is disabled', async () => {
      const sender = client.createSender('robot-telemetry');
      const receiver = client.createReceiver('robot-telemetry');
      const messageId = `duplicate-${suffix}`;
      try {
        await sender.sendMessages([
          { body: { copy: 1, suffix }, messageId },
          { body: { copy: 2, suffix }, messageId },
        ]);
        const messages = await receiver.receiveMessages(2, { maxWaitTimeInMs: 15000 });
        assert.equal(messages.length, 2);
        assert.deepEqual(messages.map(message => message.messageId), [messageId, messageId]);
        for (const message of messages) await receiver.completeMessage(message);
        return `delivered ${messages.length} duplicate-id messages`;
      } finally {
        await sender.close();
        await receiver.close();
      }
    });

    await record('peeked queue message remains available for receive', async () => {
      const sender = client.createSender('robot-telemetry');
      const receiver = client.createReceiver('robot-telemetry');
      const messageId = `peek-${suffix}`;
      try {
        await sender.sendMessages({ body: { scenario: 'peek-non-destructive', suffix }, messageId });
        const peeked = await receiver.peekMessages(1);
        assert.equal(peeked.length, 1);
        assert.equal(peeked[0].messageId, messageId);
        const received = await receiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(received.length, 1);
        assert.equal(received[0].messageId, messageId);
        await receiver.completeMessage(received[0]);
        return `peeked and received message ${messageId}`;
      } finally {
        await sender.close();
        await receiver.close();
      }
    });

    await record('dead-lettered queue message is available on dead-letter subqueue', async () => {
      const sender = client.createSender('robot-telemetry');
      const receiver = client.createReceiver('robot-telemetry');
      const deadLetterReceiver = client.createReceiver('robot-telemetry', { subQueueType: 'deadLetter' });
      const messageId = `deadletter-${suffix}`;
      try {
        await sender.sendMessages({ body: { scenario: 'dead-letter', suffix }, messageId });
        const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(messages.length, 1);
        assert.equal(messages[0].messageId, messageId);
        await receiver.deadLetterMessage(messages[0], {
          deadLetterReason: 'globalstack-test',
          deadLetterErrorDescription: 'parity dead-letter smoke',
        });
        const deadLetters = await deadLetterReceiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(deadLetters.length, 1);
        assert.equal(deadLetters[0].messageId, messageId);
        await deadLetterReceiver.completeMessage(deadLetters[0]);
        return `dead-lettered message ${messageId}`;
      } finally {
        await sender.close();
        await receiver.close();
        await deadLetterReceiver.close();
      }
    });

    await record('topic publish and subscription receive configured entity', async () => {
      const sender = client.createSender('topic.1');
      const receiver = client.createReceiver('topic.1', 'subscription.1');
      try {
        await sender.sendMessages(topicMessage);
        const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 15000 });
        assert.equal(messages.length, 1);
        assert.equal(messages[0].messageId, topicMessage.messageId);
        await receiver.completeMessage(messages[0]);
        return `received topic message ${messages[0].messageId}`;
      } finally {
        await sender.close();
        await receiver.close();
      }
    });

    await record('completed topic subscription message is removed from active delivery', async () => {
      const receiver = client.createReceiver('topic.1', 'subscription.1');
      try {
        const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 3000 });
        assert.equal(messages.length, 0);
        return 'subscription returned no active messages after completion';
      } finally {
        await receiver.close();
      }
    });

    await record('missing topic is rejected by emulator', async () => {
      const sender = client.createSender(`missing-topic-${suffix}`);
      try {
        await assert.rejects(
          () => sender.sendMessages({ body: { scenario: 'missing-topic' }, messageId: `missing-topic-${suffix}` }),
          error => /not found|does not exist|404|messaging entity/i.test(error.message),
        );
        return 'missing topic rejected';
      } finally {
        await sender.close().catch(() => {});
      }
    });

    await record('missing subscription is rejected by emulator', async () => {
      const receiver = client.createReceiver('topic.1', `missing-subscription-${suffix}`);
      try {
        await assert.rejects(
          () => receiver.receiveMessages(1, { maxWaitTimeInMs: 3000 }),
          error => /not found|does not exist|404|messaging entity/i.test(error.message),
        );
        return 'missing subscription rejected';
      } finally {
        await receiver.close().catch(() => {});
      }
    });

    await record('missing queue is rejected by emulator', async () => {
      const receiver = client.createReceiver(`missing-${suffix}`);
      try {
        await assert.rejects(
          () => receiver.receiveMessages(1, { maxWaitTimeInMs: 3000 }),
          error => /not found|does not exist|404|messaging entity/i.test(error.message),
        );
        return 'missing queue rejected';
      } finally {
        await receiver.close().catch(() => {});
      }
    });
  } finally {
    await client.close();
  }

  ok = true;
} catch {
  ok = false;
} finally {
  await record('cleanup service bus emulator compose profile', async () => {
    await down(docker);
    return 'compose down -v completed';
  }).catch(() => {});
}

const report = {
  ok,
  generatedAt: new Date().toISOString(),
  scope: 'Official Azure Service Bus emulator health plus configured queue/topic messaging behavior.',
  caveat: 'Official-emulator evidence only. Real Azure ARM and data-plane captures are still required before cloudValidated claims.',
  steps,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Service Bus emulator E2E ${ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!ok) process.exit(1);
