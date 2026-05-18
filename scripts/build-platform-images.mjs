import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const imagesRoot = join(root, 'dist', 'platform-images');

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
  '-t',
  'globalstack/azure-emulator:local',
  '-f',
  join(root, 'templates', 'emulator', 'Dockerfile'),
  root,
]);
if (emulatorCode !== 0) {
  failures.push({ platform: 'globalstack-azure', image: 'globalstack/azure-emulator:local', code: emulatorCode });
}

for (const platform of azurePlatforms) {
  if (failures.length > 0) break;
  const context = join(imagesRoot, platform.id);
  console.log(`\n=== Building ${platform.imageTag} from ${context} ===`);
  const code = await run(docker.command, [
    ...docker.prefix,
    'build',
    '--pull=false',
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

console.log(`\nBuilt ${azurePlatforms.length} Azure runner images.`);
