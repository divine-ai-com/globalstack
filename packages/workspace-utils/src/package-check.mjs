import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const syntaxExtensions = new Set(['.mjs', '.js', '.cjs']);
const testExtensions = new Set(['.mjs', '.js', '.cjs']);

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(absolutePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

async function collectEntryPaths(packageDir, entry) {
  const absolutePath = join(packageDir, entry);
  if (!await pathExists(absolutePath)) {
    return [];
  }
  const info = await stat(absolutePath);
  if (info.isDirectory()) {
    return walk(absolutePath);
  }
  return [absolutePath];
}

function packageLabel(manifest, packageDir) {
  return manifest.name ?? packageDir;
}

function normalizeExportTargets(exportsField) {
  const targets = [];
  for (const [key, value] of Object.entries(exportsField ?? {})) {
    targets.push([key, value]);
  }
  return targets;
}

export async function loadPackageManifest(packageDir) {
  const manifestPath = join(packageDir, 'package.json');
  const manifestText = await readFile(manifestPath, 'utf8');
  return JSON.parse(manifestText);
}

export async function checkPackageContract(packageDir) {
  const manifest = await loadPackageManifest(packageDir);
  const errors = [];

  for (const fileEntry of manifest.files ?? []) {
    if (!await pathExists(join(packageDir, fileEntry))) {
      errors.push(`declares missing files entry ${fileEntry}`);
    }
  }

  for (const [exportKey, exportTarget] of normalizeExportTargets(manifest.exports)) {
    const target = String(exportTarget);
    if (target.includes('*')) {
      const prefix = target.split('*')[0];
      if (!await pathExists(join(packageDir, prefix))) {
        errors.push(`export ${exportKey} points at missing prefix ${target}`);
      }
      continue;
    }
    if (!await pathExists(join(packageDir, target))) {
      errors.push(`export ${exportKey} points at missing file ${target}`);
    }
  }

  return {
    manifest,
    errors,
  };
}

export async function collectSyntaxFiles(packageDir) {
  const manifest = await loadPackageManifest(packageDir);
  const files = new Set();
  for (const fileEntry of manifest.files ?? []) {
    const entryPaths = await collectEntryPaths(packageDir, fileEntry);
    for (const filePath of entryPaths) {
      if (syntaxExtensions.has(extname(filePath))) {
        files.add(filePath);
      }
    }
  }
  return [...files].sort();
}

export async function collectTestFiles(packageDir) {
  const testRoot = join(packageDir, 'src');
  if (!await pathExists(testRoot)) {
    return [];
  }
  const files = await walk(testRoot);
  return files.filter(filePath => {
    const extension = extname(filePath);
    return testExtensions.has(extension) && filePath.includes('.test.');
  });
}

async function runCommand(command, args, cwd) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
    });
    child.on('exit', code => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', rejectPromise);
  });
}

export async function runPackageCheck(packageDir, mode = 'validate') {
  const { manifest, errors } = await checkPackageContract(packageDir);
  const label = packageLabel(manifest, packageDir);

  if (errors.length > 0) {
    throw new Error(`${label} contract failed:\n- ${errors.join('\n- ')}`);
  }

  if (mode === 'contracts') {
    console.log(`${label}: contract ok`);
    return;
  }

  if (mode === 'build' || mode === 'validate') {
    const syntaxFiles = await collectSyntaxFiles(packageDir);
    if (syntaxFiles.length > 0) {
      await runCommand(process.execPath, ['--check', ...syntaxFiles.map(filePath => resolve(filePath))], packageDir);
    }
    console.log(`${label}: build ok`);
  }

  if (mode === 'test' || mode === 'validate') {
    const testFiles = await collectTestFiles(packageDir);
    if (testFiles.length === 0) {
      console.log(`${label}: no package tests`);
      return;
    }
    await runCommand(process.execPath, ['--test', ...testFiles.map(filePath => resolve(filePath))], packageDir);
    console.log(`${label}: test ok`);
  }
}

async function maybeRunCli() {
  if (!process.argv[1]) {
    return;
  }
  if (import.meta.url !== pathToFileURL(process.argv[1]).href) {
    return;
  }
  const mode = process.argv[2] ?? 'validate';
  await runPackageCheck(process.cwd(), mode);
}

await maybeRunCli();
