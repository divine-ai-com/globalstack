import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distPath, verificationRepoRoot, verifiedWorkspacePath, workspaceRoot } from '../../workspace-utils/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const verifiedRoot = verifiedWorkspacePath(root);
const verificationRoot = verificationRepoRoot(root);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const shipmentTemplateRoot = path.resolve(moduleDir, '../../../templates/shipments/azure');

function argValue(name) {
  const direct = process.argv.find(arg => arg.startsWith(`${name}=`));
  return direct ? direct.slice(name.length + 1) : '';
}

function relativePosix(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function resolveBundleDir() {
  const bundleArg = argValue('--bundle');
  if (bundleArg) {
    return path.resolve(bundleArg);
  }

  const poId = argValue('--po-id');
  const prId = argValue('--pr-id');
  if (poId && prId) {
    return path.join(verifiedRoot, poId, prId);
  }

  throw new Error('Pass either --bundle=/abs/path/to/Pr... or both --po-id=<id> and --pr-id=<id>.');
}

function shipmentDirFor(bundleDir) {
  const prId = path.basename(bundleDir);
  const poId = path.basename(path.dirname(bundleDir));
  return path.join(verificationRoot, '.lifecycle-work', 'shipments', poId, `${prId}_unzipped`);
}

async function copyIfPresent(source, target) {
  if (!(await exists(source))) return;
  await cp(source, target, { force: true });
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'ignore',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function dockerCleanupPrefix() {
  try {
    await run('docker', ['info']);
    return [];
  } catch {
    try {
      await run('sudo', ['-n', 'docker', 'info']);
      return ['sudo', '-n'];
    } catch {
      return null;
    }
  }
}

async function removeWithDocker(target) {
  const dockerPrefix = await dockerCleanupPrefix();
  if (!dockerPrefix) {
    return false;
  }

  const parentDir = path.dirname(target);
  const baseName = path.basename(target);
  const image = 'globalstack/azure-emulator:local';
  const dockerArgs = [
    ...dockerPrefix,
    'docker',
    'run',
    '--rm',
    '-v',
    `${parentDir}:/cleanup-parent`,
    '--entrypoint',
    'sh',
    image,
    '-lc',
    `rm -rf "/cleanup-parent/${baseName}"`,
  ];

  try {
    await run(dockerArgs[0], dockerArgs.slice(1));
    return true;
  } catch {
    return false;
  }
}

async function safeRemoveDir(target) {
  try {
    await rm(target, { recursive: true, force: true });
    return;
  } catch (error) {
    if (!['EACCES', 'EPERM', 'ENOTEMPTY'].includes(error?.code ?? '')) {
      throw error;
    }
  }

  if (await removeWithDocker(target)) {
    await rm(target, { recursive: true, force: true });
    return;
  }

  await rm(target, { recursive: true, force: true });
}

async function main() {
  const bundleDir = await resolveBundleDir();
  const metadataPath = path.join(bundleDir, 'metadata.json');
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  if ((metadata.cloud ?? '').toLowerCase() !== 'azure') {
    throw new Error(`Only Azure bundles are supported. Found cloud=${metadata.cloud ?? 'unknown'}`);
  }

  const shipmentDir = shipmentDirFor(bundleDir);
  const taskFolderName = path.basename(bundleDir);
  const taskTargetDir = path.join(shipmentDir, taskFolderName);
  const dockerDir = path.join(shipmentDir, 'docker');
  const runtimeBundleDir = path.join(distPath(root, 'verified-bundle-runtime'), path.basename(path.dirname(bundleDir)), taskFolderName);

  await safeRemoveDir(shipmentDir);
  await mkdir(dockerDir, { recursive: true });

  await cp(bundleDir, taskTargetDir, { recursive: true });
  if (await exists(path.join(runtimeBundleDir, 'globalstack'))) {
    await cp(path.join(runtimeBundleDir, 'globalstack'), path.join(taskTargetDir, 'globalstack'), { recursive: true });
  }
  await cp(path.join(shipmentTemplateRoot, 'docker-compose.yml'), path.join(dockerDir, 'docker-compose.yml'));
  await cp(path.join(shipmentTemplateRoot, 'run.sh'), path.join(shipmentDir, 'run.sh'));

  const promptPath = path.join(bundleDir, 'lib', 'PROMPT.md');
  const promptText = await readFile(promptPath, 'utf8').catch(() => '');
  if (promptText) {
    await writeFile(path.join(shipmentDir, 'prompt.txt'), promptText.endsWith('\n') ? promptText : `${promptText}\n`);
    await writeFile(path.join(shipmentDir, 'problem_statement.txt'), promptText.endsWith('\n') ? promptText : `${promptText}\n`);
  }

  await copyIfPresent(path.join(bundleDir, 'execution.log'), path.join(shipmentDir, 'execution.log'));
  await copyIfPresent(path.join(bundleDir, 'execution-report.json'), path.join(shipmentDir, 'execution-report.json'));

  await writeFile(
    path.join(dockerDir, 'README.md'),
    [
      '# Shipment Runtime',
      '',
      'This directory contains the minimal shipment runtime required to execute the verified Azure bundle.',
      '',
      `- Task path: \`${taskFolderName}\``,
      `- Product repo relative source root: \`${relativePosix(shipmentDir, root)}\``,
      '',
      'Use `../run.sh` from the shipment root.',
      '',
    ].join('\n'),
  );

  console.log(JSON.stringify({
    bundleDir,
    shipmentDir,
    taskFolder: taskFolderName,
    platformId: metadata.platformId ?? null,
  }, null, 2));
}

await main();
