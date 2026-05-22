import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { distPath, workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { azurePlatforms } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const imagesRoot = distPath(root, 'platform-images');
const requestedPlatformIds = new Set(
  process.argv
    .filter(arg => arg.startsWith('--platform='))
    .flatMap(arg => arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean)),
);
const platforms = requestedPlatformIds.size > 0
  ? azurePlatforms.filter(platform => requestedPlatformIds.has(platform.id))
  : azurePlatforms;

if (platforms.length === 0) {
  console.error(`No platform images selected from: ${[...requestedPlatformIds].join(', ')}`);
  process.exit(1);
}

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      stdio: opts.stdio ?? 'inherit',
      env: process.env,
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore' });
  if (direct === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore' });
  if (sudo === 0) return { command: 'sudo', prefix: ['-n', 'docker'] };
  return { command: 'docker', prefix: [] };
}

const failures = [];
const docker = await dockerCommand();

console.log('\n=== Building globalstack/azure-emulator:local from templates/emulator/Dockerfile ===');
const emulatorCode = await run(docker.command, [
  ...docker.prefix,
  'build',
  '--pull=false',
  '--label',
  'io.globalstack.owner=globalstack',
  '--label',
  'io.globalstack.product=azure-emulator',
  '--label',
  'io.globalstack.scope=platform-runtime',
  '--label',
  'io.globalstack.cloud=azure',
  '-t',
  'globalstack/azure-emulator:local',
  '-f',
  join(root, 'templates', 'emulator', 'Dockerfile'),
  root,
]);
if (emulatorCode !== 0) {
  failures.push({ platform: 'globalstack-azure', image: 'globalstack/azure-emulator:local', code: emulatorCode });
}

for (const platform of platforms) {
  if (failures.length > 0) break;
  const context = join(imagesRoot, platform.id);
  console.log(`\n=== Building ${platform.imageTag} from ${context} ===`);
  const code = await run(docker.command, [
    ...docker.prefix,
    'build',
    '--pull=false',
    '--label',
    'io.globalstack.owner=globalstack',
    '--label',
    'io.globalstack.product=azure-runner',
    '--label',
    'io.globalstack.scope=platform-runtime',
    '--label',
    'io.globalstack.cloud=azure',
    '--label',
    `io.globalstack.platform=${platform.id}`,
    '-t',
    platform.imageTag,
    context,
  ]);
  if (code !== 0) {
    failures.push({ platform: platform.id, image: platform.imageTag, code });
    break;
  }
}

if (failures.length > 0) {
  console.error('\nImage build failed:');
  for (const failure of failures) {
    console.error(`- ${failure.platform} (${failure.image}) exited ${failure.code}`);
  }
  process.exit(1);
}

console.log(`\nBuilt ${platforms.length} Azure runner image${platforms.length === 1 ? '' : 's'}.`);
