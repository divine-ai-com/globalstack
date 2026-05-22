import { spawn } from 'node:child_process';
import { azurePlatforms } from '../../platform-registry/src/index.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const keepHoursArg = process.argv.find(arg => arg.startsWith('--keep-hours='));
const keepHours = Math.max(1, Number.parseInt(keepHoursArg?.split('=')[1] ?? '24', 10) || 24);
const now = Date.now();

const platformIds = new Set(azurePlatforms.map(platform => platform.id));
const keepImageRefs = new Set(['globalstack/azure-emulator:local', ...azurePlatforms.map(platform => platform.imageTag)]);

function run(command, runArgs, options = {}) {
  return new Promise(resolve => {
    const child = spawn(command, runArgs, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'pipe',
    });
    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', chunk => { stdout += chunk; });
    if (child.stderr) child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore' });
  if (direct.code === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore' });
  if (sudo.code === 0) return { command: 'sudo', prefix: ['-n', 'docker'] };
  throw new Error('Docker is not accessible via docker or sudo -n docker.');
}

function parseJsonLines(stdout) {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function olderThan(createdAt) {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return created <= (now - keepHours * 60 * 60 * 1000);
}

function isGlobalStackImageRef(ref) {
  return String(ref ?? '').startsWith('globalstack/azure-');
}

function isGlobalStackContainerName(name) {
  if (name === 'globalstack-azure') return true;
  if (name.startsWith('globalstack-') && name.endsWith('-azure')) return true;
  return [...platformIds].some(platformId => name.startsWith(`${platformId}-runner-`));
}

function isGlobalStackNetwork(name) {
  return [...platformIds].some(platformId => name === `${platformId}_default`);
}

function isGlobalStackVolume(name) {
  if (name.startsWith('globalstack-')) return true;
  return [...platformIds].some(platformId => name.startsWith(`${platformId}_`));
}

function isGlobalStackComposeProject(project) {
  if (project === 'globalstack-azure') return true;
  return platformIds.has(String(project ?? ''));
}

async function inspectImage(docker, imageId) {
  const result = await run(docker.command, [...docker.prefix, 'image', 'inspect', imageId], { stdio: 'pipe' });
  if (result.code !== 0) return null;
  return JSON.parse(result.stdout)[0] ?? null;
}

async function remove(docker, kind, argsForRemove, description, summary) {
  summary.candidates += 1;
  if (dryRun) {
    console.log(`DRY RUN ${kind}: ${description}`);
    summary.dryRun += 1;
    return;
  }
  const result = await run(docker.command, [...docker.prefix, ...argsForRemove], { stdio: 'pipe' });
  if (result.code === 0) {
    console.log(`REMOVED ${kind}: ${description}`);
    summary.removed += 1;
    return;
  }
  console.log(`SKIPPED ${kind}: ${description} (${result.stderr.trim() || `exit ${result.code}`})`);
  summary.skipped += 1;
}

const docker = await dockerCommand();

const summaries = {
  containers: { candidates: 0, removed: 0, skipped: 0, dryRun: 0 },
  networks: { candidates: 0, removed: 0, skipped: 0, dryRun: 0 },
  volumes: { candidates: 0, removed: 0, skipped: 0, dryRun: 0 },
  images: { candidates: 0, removed: 0, skipped: 0, dryRun: 0 },
};

const containerLs = await run(docker.command, [...docker.prefix, 'ps', '-a', '--no-trunc', '--format', '{{json .}}'], { stdio: 'pipe' });
if (containerLs.code !== 0) throw new Error(containerLs.stderr || 'failed to list docker containers');
for (const container of parseJsonLines(containerLs.stdout)) {
  const status = String(container.Status ?? '').toLowerCase();
  const running = status.startsWith('up ');
  const image = String(container.Image ?? '');
  const name = String(container.Names ?? '');
  if (running) continue;
  if (!isGlobalStackImageRef(image) && !isGlobalStackContainerName(name)) continue;
  await remove(
    docker,
    'container',
    ['rm', '-f', container.ID],
    `${name} (${image || container.ID})`,
    summaries.containers,
  );
}

const networkLs = await run(docker.command, [...docker.prefix, 'network', 'ls', '--format', '{{json .}}'], { stdio: 'pipe' });
if (networkLs.code !== 0) throw new Error(networkLs.stderr || 'failed to list docker networks');
for (const network of parseJsonLines(networkLs.stdout)) {
  const name = String(network.Name ?? '');
  if (!isGlobalStackNetwork(name)) continue;
  await remove(
    docker,
    'network',
    ['network', 'rm', name],
    name,
    summaries.networks,
  );
}

const volumeLs = await run(docker.command, [...docker.prefix, 'volume', 'ls', '--format', '{{json .}}'], { stdio: 'pipe' });
if (volumeLs.code !== 0) throw new Error(volumeLs.stderr || 'failed to list docker volumes');
for (const volume of parseJsonLines(volumeLs.stdout)) {
  const name = String(volume.Name ?? '');
  if (!isGlobalStackVolume(name)) continue;
  await remove(
    docker,
    'volume',
    ['volume', 'rm', name],
    name,
    summaries.volumes,
  );
}

const imageLs = await run(docker.command, [...docker.prefix, 'image', 'ls', '-a', '--no-trunc', '--format', '{{json .}}'], { stdio: 'pipe' });
if (imageLs.code !== 0) throw new Error(imageLs.stderr || 'failed to list docker images');
for (const image of parseJsonLines(imageLs.stdout)) {
  const repository = String(image.Repository ?? '');
  const tag = String(image.Tag ?? '');
  const ref = `${repository}:${tag}`;
  const dangling = repository === '<none>' || tag === '<none>';
  if (!dangling && !isGlobalStackImageRef(ref)) continue;
  if (!dangling && keepImageRefs.has(ref)) continue;
  const inspected = await inspectImage(docker, image.ID);
  const labels = inspected?.Config?.Labels ?? {};
  const globalstackOwned = labels['io.globalstack.owner'] === 'globalstack'
    || isGlobalStackComposeProject(labels['com.docker.compose.project'])
    || isGlobalStackContainerName(String(labels['com.docker.compose.service'] ?? ''));
  if (dangling && !globalstackOwned) continue;
  if (inspected?.Created && !olderThan(inspected.Created)) continue;
  await remove(
    docker,
    'image',
    ['image', 'rm', '-f', image.ID],
    dangling ? `${image.ID} (dangling GlobalStack image)` : ref,
    summaries.images,
  );
}

console.log('\nGlobalStack Docker janitor summary');
console.log(JSON.stringify({
  dryRun,
  keepHours,
  summaries,
}, null, 2));
