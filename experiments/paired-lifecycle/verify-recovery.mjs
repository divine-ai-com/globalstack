import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { removeOwnedGroup } from './cleanup.mjs';

const directory = resolve(process.argv[2]);
const report = JSON.parse(await readFile(resolve(directory, 'result.json'), 'utf8'));
assert.equal(report.targets.length, 1);
assert.equal(report.targets[0].name, 'azure');
assert.ok(report.targets[0].injectedFault?.startsWith('controller SIGKILL'));
const privateDir = resolve(directory, 'azure/private');
const manifest = JSON.parse(await readFile(resolve(privateDir, 'recovery.json'), 'utf8'));
let watchdog;
const deadline = Date.now() + 360000;
while (Date.now() < deadline) {
  try { watchdog = JSON.parse(await readFile(resolve(directory, 'azure/watchdog.json'), 'utf8')); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await new Promise(done => setTimeout(done, 2000));
}
// Independent read-back is mandatory even when the watchdog reports success.
const verified = await removeOwnedGroup(manifest);
const result = { schemaVersion: 1, experiment: 'controller termination after native Azure create', sourceRevision: report.revision, source: report.source, watchdog: watchdog ?? { absent: false, error: 'No watchdog result before the verification deadline' }, verification: verified, privateFilesRemoved: false, passed: watchdog?.absent === true && verified.absent && !verified.fallbackDelete };
if (verified.absent) {
  await writeFile(resolve(directory, 'azure/cleanup.done'), 'verified\n');
  await rm(privateDir, { recursive: true, force: true });
  result.privateFilesRemoved = true;
}
await writeFile(resolve(directory, 'recovery-result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
