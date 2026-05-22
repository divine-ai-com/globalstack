import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { distPath, workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { azurePlatforms } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outPath = distPath(root, 'platform-lifecycle-smoke-results.json');
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

async function imageExists(docker, image) {
  const code = await run(docker.command, [...docker.prefix, 'image', 'inspect', image], { stdio: 'ignore' });
  return code === 0;
}

async function prewarmImagesIfNeeded(docker, strategy) {
  if (strategy === 'reuse') return;
  const requiredImages = ['globalstack/azure-emulator:local', ...platforms.map(platform => platform.imageTag)];
  const missing = [];
  for (const image of requiredImages) {
    if (!(await imageExists(docker, image))) missing.push(image);
  }
  if (strategy === 'build' || missing.length > 0) {
    const platformArg = platforms.length > 0
      ? [`--platform=${platforms.map(platform => platform.id).join(',')}`]
      : [];
    const buildCode = await run('node', ['scripts/runtime/build-platform-images.mjs', ...platformArg]);
    if (buildCode !== 0) process.exit(buildCode);
  }
}

const selected = new Set(
  process.argv
    .filter(arg => arg.startsWith('--platform='))
    .flatMap(arg => arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean)),
);
const platforms = selected.size > 0 ? azurePlatforms.filter(platform => selected.has(platform.id)) : azurePlatforms;
if (platforms.length === 0) throw new Error(`No platforms selected from: ${[...selected].join(', ')}`);

const docker = await dockerCommand();
const imageBuildStrategy = process.env.GLOBALSTACK_IMAGE_BUILD_STRATEGY ?? 'auto';
if (docker.command === 'sudo') {
  await run('sudo', [
    '-n',
    'chown',
    '-R',
    `${process.getuid()}:${process.getgid()}`,
    join(root, 'dist', 'platform-images'),
  ], { stdio: 'ignore' });
}

const renderCode = await run('node', ['scripts/render/render-platform-templates.mjs']);
if (renderCode !== 0) process.exit(renderCode);
await prewarmImagesIfNeeded(docker, imageBuildStrategy);

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
  const providerLifecyclePath = join(platformDir, 'reports', 'provider-lifecycle-response.json');
  let report = null;
  let deployment = null;
  let providerLifecycle = null;
  try {
    report = await readJson(reportPath);
    deployment = await readJson(deploymentPath);
    providerLifecycle = await readJson(providerLifecyclePath);
  } catch {
    // captured in result below
  }

  const providerLifecycleOk = providerLifecycle?.status === 'PASS'
    && Array.isArray(providerLifecycle.operations)
    && providerLifecycle.operations.length > 0
    && providerLifecycle.operations.every(operation => operation.status === 'PASS');
  const ok = code === 0
    && report?.status === 'PASS'
    && report?.stage === 'destroy'
    && deployment?.properties?.provisioningState === 'Succeeded'
    && providerLifecycleOk;
  results.push({
    platformId: platform.id,
    ok,
    exitCode: code,
    durationMs: Date.now() - startedAt,
    finalStage: report?.stage ?? null,
    finalStatus: report?.status ?? null,
    provisioningState: deployment?.properties?.provisioningState ?? null,
    deploymentStepCount: deployment?.properties?.globalstackDeploymentSteps?.length ?? null,
    providerLifecycleOk,
    providerLifecycleOperationCount: providerLifecycle?.operations?.length ?? null,
    reportPath,
    providerLifecyclePath,
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
