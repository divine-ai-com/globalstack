import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, 'dist', 'platform-lifecycle-smoke-results.json');
const token = process.env.GLOBALSTACK_AUTH_TOKEN;

if (!token || token.trim() === '') {
  throw new Error('GLOBALSTACK_AUTH_TOKEN is required to run platform runner lifecycle smoke.');
}

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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const selected = new Set(
  process.argv
    .filter(arg => arg.startsWith('--platform='))
    .flatMap(arg => arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean)),
);
const platforms = selected.size > 0 ? azurePlatforms.filter(platform => selected.has(platform.id)) : azurePlatforms;
if (platforms.length === 0) throw new Error(`No platforms selected from: ${[...selected].join(', ')}`);

const renderCode = await run('node', ['scripts/render-platform-templates.mjs']);
if (renderCode !== 0) process.exit(renderCode);

const docker = await dockerCommand();
const results = [];

for (const platform of platforms) {
  const platformDir = join(root, 'dist', 'platform-images', platform.id);
  await mkdir(join(platformDir, 'reports'), { recursive: true });
  await mkdir(join(platformDir, 'work'), { recursive: true });
  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: token,
    PIPELINE_STAGE_SCOPE: process.env.PIPELINE_STAGE_SCOPE ?? 'full',
  };

  const startedAt = Date.now();
  let code = 1;
  try {
    code = await run(docker.command, [
      ...docker.prefix,
      'compose',
      'up',
      '--build',
      '--abort-on-container-exit',
      '--exit-code-from',
      'runner',
      'runner',
    ], { cwd: platformDir, env });
  } finally {
    await run(docker.command, [
      ...docker.prefix,
      'compose',
      'down',
      '--remove-orphans',
    ], { cwd: platformDir, env, stdio: 'ignore' });
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
  const deploymentPath = join(platformDir, 'reports', 'deployment-response.json');
  let report = null;
  let deployment = null;
  try {
    report = await readJson(reportPath);
    deployment = await readJson(deploymentPath);
  } catch {
    // captured in result below
  }

  const ok = code === 0 && report?.status === 'PASS' && report?.stage === 'destroy' && deployment?.properties?.provisioningState === 'Succeeded';
  results.push({
    platformId: platform.id,
    ok,
    exitCode: code,
    durationMs: Date.now() - startedAt,
    finalStage: report?.stage ?? null,
    finalStatus: report?.status ?? null,
    provisioningState: deployment?.properties?.provisioningState ?? null,
    deploymentStepCount: deployment?.properties?.globalstackDeploymentSteps?.length ?? null,
    reportPath,
  });

  await writeFile(outPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    results,
  }, null, 2)}\n`);

  if (!ok) {
    console.error(`Platform lifecycle failed for ${platform.id}. Report: ${reportPath}`);
    break;
  }
}

const failed = results.filter(result => !result.ok);
console.log(`Platform lifecycle smoke completed: ${results.length - failed.length}/${results.length} passed.`);
console.log(`Results: ${outPath}`);
if (failed.length > 0 || results.length !== platforms.length) process.exit(1);
