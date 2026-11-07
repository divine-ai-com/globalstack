import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, statfs } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { platforms } from './platforms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const validationOnly = args.includes('--validation-only');
const platform = validationOnly ? 'document-search-validation' : args.find(arg => arg.startsWith('--platform='))?.slice(11);
assert.ok(validationOnly || platforms.some(item => item.id === platform), 'Select --platform=<registered ID>');
const modulePath = process.env.PAIRED_PLAYWRIGHT_MODULE;
assert.ok(modulePath?.startsWith('/'), 'Absolute path to installed playwright-core/index.mjs required');
const { chromium } = await import(pathToFileURL(modulePath).href);
const root = resolve(here, '../../reports/platform-walkthrough', `${platform}-${randomBytes(6).toString('hex')}`);
await mkdir(root, { recursive: true, mode: 0o700 });
const space = await statfs(root);
assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3, '40 GiB reserve required');
const runDir = resolve(root, 'run');
let template = await readFile(resolve(here, 'walkthrough.html'), 'utf8');
if (validationOnly) template = template.replace('Same fixture hashes and tool image for both targets.', 'One Bicep-compiled template; direct ARM validation against both targets.').replace('Empty resource group only.', 'Search foundation validation only. No application deployment or event-flow claim.');
const events = async () => {
  try { return (await readFile(resolve(runDir, 'events.ndjson'), 'utf8')).split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
};
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' || !['/', '/events'].includes(req.url)) { res.writeHead(404).end(); return; }
  try {
    res.writeHead(200, { 'content-type': req.url === '/' ? 'text/html; charset=utf-8' : 'application/json', 'cache-control': 'no-store' });
    res.end(req.url === '/' ? template : JSON.stringify(await events()));
  } catch { res.writeHead(500).end(); }
});
let browser, context, page, browserVersion, exitCode = 1;
const startedAt = new Date().toISOString();
try {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  browser = await chromium.launch({ headless: true, executablePath: process.env.PAIRED_CHROMIUM_EXECUTABLE });
  browserVersion = browser.version();
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: root, size: { width: 1600, height: 1000 } } });
  page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForTimeout(500);
  console.log(`Walkthrough: ${root}`);
  exitCode = await new Promise((done, fail) => {
    const runner = validationOnly ? resolve(here, '../production-scenarios/validate-search.mjs') : resolve(here, 'run.mjs');
    const child = spawn(process.execPath, [runner, ...args], { env: { ...process.env, PAIRED_RUN_DIR: runDir }, stdio: 'inherit' });
    child.on('error', fail); child.on('exit', code => done(code ?? 1));
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(root, 'terminal-final.png') });
} finally {
  if (context) await context.close();
  if (page) { await page.video().saveAs(resolve(root, 'terminal-walkthrough.webm')); await page.video().delete(); }
  if (browser) await browser.close();
  server.closeAllConnections(); await new Promise(done => server.close(done));
}
const captured = await events();
const replay = template.replace('<!--CAPTURE-->', `<script id="capture" type="application/json">${JSON.stringify(captured).replaceAll('<', '\\u003c')}</script>`);
await writeFile(resolve(root, 'replay.html'), replay, { mode: 0o600 });
const digest = async name => createHash('sha256').update(await readFile(resolve(root, name))).digest('hex');
await writeFile(resolve(root, 'recording.json'), JSON.stringify({ platform, startedAt, completedAt: new Date().toISOString(), exitCode, eventCount: captured.length, video: 'terminal-walkthrough.webm', sha256: await digest('terminal-walkthrough.webm'), eventSha256: await digest('run/events.ndjson'), kind: 'Browser video of live sanitized command output and API observations, not Azure Portal', portalScreenshots: 'pending', timing: 'Actual capture speed; requested targets run sequentially', browserVersion, playwrightVersion: JSON.parse(await readFile(resolve(dirname(modulePath), 'package.json'), 'utf8')).version }, null, 2) + '\n');
console.log(`Recorded video and replay: ${root}`);
process.exitCode = exitCode;
