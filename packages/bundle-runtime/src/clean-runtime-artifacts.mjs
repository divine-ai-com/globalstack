#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { distPath, verifiedWorkspacePath, workspaceRoot } from "../../workspace-utils/src/index.mjs";

const repoRoot = workspaceRoot(import.meta.url);
const dryRun = process.argv.includes("--dry-run");

const platformRuntimeDirs = [
  distPath(repoRoot, "platform-images"),
];

const verifiedRoot = verifiedWorkspacePath(repoRoot);
const removableVerifiedFiles = new Set([
  "execution.log",
  "execution-report.json",
  "execution_report.json",
  "flat-outputs.json",
]);

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function removeTarget(target, removed) {
  if (!(await pathExists(target))) {
    return;
  }
  removed.push(target);
  if (!dryRun) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

async function walkVerified(dir, removed) {
  if (!(await pathExists(dir))) {
    return;
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkVerified(entryPath, removed);
      continue;
    }
    if (removableVerifiedFiles.has(entry.name)) {
      await removeTarget(entryPath, removed);
    }
  }
}

async function cleanPlatformRuntimeDirs(removed) {
  for (const root of platformRuntimeDirs) {
    if (!(await pathExists(root))) {
      continue;
    }
    const platforms = await fs.readdir(root, { withFileTypes: true });
    for (const platform of platforms) {
      if (!platform.isDirectory()) {
        continue;
      }
      const platformRoot = path.join(root, platform.name);
      for (const runtimeDir of ["reports", "work", "volume"]) {
        await removeTarget(path.join(platformRoot, runtimeDir), removed);
      }
    }
  }
}

async function main() {
  const removed = [];
  await cleanPlatformRuntimeDirs(removed);
  await walkVerified(verifiedRoot, removed);

  const summary = {
    dryRun,
    removedCount: removed.length,
    removed: removed
      .map((item) => path.relative(repoRoot, item))
      .sort((a, b) => a.localeCompare(b)),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
