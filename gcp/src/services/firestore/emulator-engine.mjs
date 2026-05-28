import { spawn } from 'node:child_process';
import net from 'node:net';

export async function startFirestoreEmulator({
  gcloud = process.env.GCLOUD_BIN ?? 'gcloud',
  host = '127.0.0.1',
  port,
  startupTimeoutMs = 15000,
} = {}) {
  const resolvedPort = port ?? await findFreePort(host);
  const args = [
    'beta',
    'emulators',
    'firestore',
    'start',
    `--host-port=${host}:${resolvedPort}`,
  ];
  const child = spawn(gcloud, args, {
    detached: true,
    env: {
      ...process.env,
      CLOUDSDK_CORE_DISABLE_PROMPTS: '1',
      CLOUDSDK_CORE_VERBOSITY: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  const record = chunk => {
    output.push(String(chunk));
    if (output.length > 100) output.shift();
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);

  try {
    await waitForTcp({ host, port: resolvedPort, timeoutMs: startupTimeoutMs, child, output });
  } catch (error) {
    killProcessGroup(child, 'SIGTERM');
    await waitForExit(child).catch(() => {});
    throw error;
  }

  return {
    host,
    port: resolvedPort,
    endpoint: `${host}:${resolvedPort}`,
    output,
    env: {
      FIRESTORE_EMULATOR_HOST: `${host}:${resolvedPort}`,
      GOOGLE_CLOUD_PROJECT: 'globalstack-local',
    },
    async stop() {
      killProcessGroup(child, 'SIGTERM');
      const exited = await Promise.race([
        waitForExit(child),
        delay(5000).then(() => false),
      ]);
      if (!exited) {
        killProcessGroup(child, 'SIGKILL');
        await waitForExit(child).catch(() => {});
      }
    },
  };
}

async function findFreePort(host) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForTcp({ host, port, timeoutMs, child, output }) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Firestore emulator exited before startup\n${output.join('')}`);
    }
    if (await canConnect(host, port)) return;
    await delay(100);
  }
  throw new Error(`Firestore emulator did not start within ${timeoutMs}ms\n${output.join('')}`);
}

function canConnect(host, port) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function waitForExit(child) {
  return new Promise(resolve => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }
    child.once('exit', () => resolve(true));
  });
}

function killProcessGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
