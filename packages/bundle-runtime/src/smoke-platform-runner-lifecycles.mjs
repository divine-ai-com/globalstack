import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { distPath, workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { readStageResults } from './stage-results.mjs';
import { azurePlatforms } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outPath = distPath(root, 'platform-lifecycle-smoke-results.json');
const token = process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-local-development';


function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.on('error', error => {
      if (options.stdio !== 'ignore') console.error(`${command}: ${error.message}`);
      resolve(1);
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
  const required = new Set([
    process.env.GLOBALSTACK_AZURE_IMAGE ?? 'globalstack/azure-emulator:local',
    ...platforms.map(platform => process.env.GLOBALSTACK_RUNNER_IMAGE ?? platform.imageTag),
  ]);
  if (strategy === 'reuse') {
    for (const image of required) {
      if (!(await imageExists(docker, image))) {
        throw new Error(`Image reuse requested but ${image} is unavailable. Build the image before running the smoke test.`);
      }
    }
    return;
  }
  const requiredImages = [...required];
  const missing = [];
  for (const image of requiredImages) {
    if (!(await imageExists(docker, image))) {
      if ([process.env.GLOBALSTACK_AZURE_IMAGE, process.env.GLOBALSTACK_RUNNER_IMAGE].includes(image)) {
        throw new Error(`Image override ${image} is unavailable. Build it before running the smoke test.`);
      }
      missing.push(image);
    }
  }
  if (strategy === 'build' || missing.length > 0) {
    const platformArg = platforms.length > 0
      ? [`--platform=${platforms.map(platform => platform.id).join(',')}`]
      : [];
    const buildCode = await run('node', ['scripts/runtime/build-platform-images.mjs', ...platformArg]);
    if (buildCode !== 0) process.exit(buildCode);
  }
}

async function normalizeHostOwnership(docker, targets) {
  const writableTargets = targets.filter(Boolean);
  if (writableTargets.length === 0) return;
  const uid = process.getuid();
  const gid = process.getgid();
  for (const target of writableTargets) {
    await run(docker.command, [
      ...docker.prefix,
      'run',
      '--rm',
      '-v',
      `${target}:/target`,
      '--pull=never',
      process.env.GLOBALSTACK_AZURE_IMAGE ?? 'globalstack/azure-emulator:local',
      'sh',
      '-lc',
      `chown -R ${uid}:${gid} /target`,
    ], { stdio: 'ignore' });
  }
}

const selected = new Set(
  process.argv
    .filter(arg => arg.startsWith('--platform='))
    .flatMap(arg => arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean)),
);
const unknown = [...selected].filter(id => !azurePlatforms.some(platform => platform.id === id));
if (unknown.length) throw new Error(`Unknown platforms: ${unknown.join(', ')}`);
const platforms = selected.size > 0 ? azurePlatforms.filter(platform => selected.has(platform.id)) : azurePlatforms;
if (platforms.length === 0) throw new Error(`No platforms selected from: ${[...selected].join(', ')}`);

const docker = await dockerCommand();
const imageBuildStrategy = process.env.GLOBALSTACK_IMAGE_BUILD_STRATEGY ?? 'auto';
if (!['auto', 'build', 'reuse'].includes(imageBuildStrategy)) {
  throw new Error(`Unknown image build strategy: ${imageBuildStrategy}`);
}
if (docker.command === 'sudo') {
  await run('sudo', [
    '-n',
    'chown',
    '-R',
    `${process.getuid()}:${process.getgid()}`,
    join(root, 'dist', 'platform-images'),
  ], { stdio: 'ignore' });
}

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), complete: false, results: [] }, null, 2)}\n`);
const renderCode = await run('node', ['scripts/render/render-platform-templates.mjs']);
if (renderCode !== 0) process.exit(renderCode);
await prewarmImagesIfNeeded(docker, imageBuildStrategy);

const results = [];

for (const platform of platforms) {
  const platformDir = join(root, 'dist', 'platform-images', platform.id);
  // Reports belong to one attempt; stale evidence must never satisfy a retry.
  await normalizeHostOwnership(docker, [join(platformDir, 'reports')]);
  await rm(join(platformDir, 'reports'), { recursive: true, force: true });
  await mkdir(join(platformDir, 'reports'), { recursive: true });
  await mkdir(join(platformDir, 'work'), { recursive: true });
  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: token,
    PIPELINE_STAGE_SCOPE: process.env.PIPELINE_STAGE_SCOPE ?? 'full',
  };

  const startedAt = Date.now();
  let code = 1;
  let cleanupCode = 1;
  try {
    code = await run(docker.command, [
      ...docker.prefix,
      'compose',
      'up',
      '--no-build',
      '--pull',
      'never',
      '--abort-on-container-exit',
      '--exit-code-from',
      'runner',
      'runner',
    ], { cwd: platformDir, env });
  } finally {
    cleanupCode = await run(docker.command, [
      ...docker.prefix,
      'compose',
      'down',
      '--remove-orphans',
    ], { cwd: platformDir, env, stdio: 'ignore' });
    await normalizeHostOwnership(docker, [
      join(platformDir, 'reports'),
      join(platformDir, 'work'),
    ]);
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
  const stageResults = await readStageResults(join(platformDir, 'reports'), platform.id);
  const ok = code === 0
    && cleanupCode === 0
    && stageResults.every(result => result.ok)
    && report?.status === 'PASS'
    && report?.stage === 'destroy'
    && deployment?.properties?.provisioningState === 'Succeeded'
    && providerLifecycleOk;
  results.push({
    platformId: platform.id,
    ok,
    exitCode: code,
    cleanupExitCode: cleanupCode,
    stages: stageResults,
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
    complete: results.length === platforms.length,
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
