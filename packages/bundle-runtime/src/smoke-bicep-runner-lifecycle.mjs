import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = workspaceRoot(import.meta.url);
const platformDir = join(root, 'dist', 'platform-images', 'azure-bicep');


function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore' });
  if (direct === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore' });
  if (sudo === 0) return { command: 'sudo', prefix: ['-n', '-E', 'docker'] };
  return { command: 'docker', prefix: [] };
}

const renderCode = await run('node', ['scripts/render-platform-templates.mjs']);
if (renderCode !== 0) process.exit(renderCode);

await mkdir(join(platformDir, 'reports'), { recursive: true });
await mkdir(join(platformDir, 'work'), { recursive: true });

const docker = await dockerCommand();
const composeEnv = {
  ...process.env,
  PIPELINE_STAGE_SCOPE: process.env.PIPELINE_STAGE_SCOPE ?? 'full',
};

let upCode = 1;
try {
  upCode = await run(docker.command, [
    ...docker.prefix,
    'compose',
    'up',
    '--build',
    '--abort-on-container-exit',
    '--exit-code-from',
    'runner',
    'runner',
  ], { cwd: platformDir, env: composeEnv });
} finally {
  await run(docker.command, [
    ...docker.prefix,
    'compose',
    'down',
    '--remove-orphans',
  ], { cwd: platformDir, env: composeEnv, stdio: 'ignore' });
  if (docker.command === 'sudo') {
    await run('sudo', [
      '-n',
      'chown',
      '-R',
      `${process.getuid()}:${process.getgid()}`,
      join(platformDir, 'reports'),
      join(platformDir, 'work'),
    ], { stdio: 'ignore' });
  }
}

const reportPath = join(platformDir, 'reports', 'lifecycle-report.json');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
if (upCode !== 0 || report.status !== 'PASS' || report.stage !== 'destroy') {
  console.error(`Bicep runner lifecycle failed. Report: ${reportPath}`);
  process.exit(upCode || 1);
}

console.log(`Bicep runner lifecycle passed. Report: ${reportPath}`);
