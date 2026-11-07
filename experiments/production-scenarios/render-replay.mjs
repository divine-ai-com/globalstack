import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Render already captured observations. This never connects to Azure or starts
// a deployment, and must not be described as a live Portal video.
const [directory] = process.argv.slice(2);
assert.ok(directory, 'Pass the directory containing result.json and events.ndjson');
const root = resolve(directory);
const raw = await readFile(resolve(root, 'events.ndjson'), 'utf8');
const events = raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
const report = JSON.parse(await readFile(resolve(root, 'result.json'), 'utf8'));
assert.ok(events.length && events[0].type === 'run-start');
assert.equal(events[0].revision, report.revision);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let template = await readFile(new URL('../platform-lifecycle/walkthrough.html', import.meta.url), 'utf8');
template = template.replaceAll('Live native lifecycle walkthrough', 'Recorded HTTP comparison');
template = template.replace("+' | Image '+e.image+' | Fixture SHA-256: '+JSON.stringify(e.source)", "+' | Captured HTTP observations'");
template = template.replace('Microsoft Azure · live', 'Microsoft Azure · captured');
template = template.replace(/<footer>[^]*?<\/footer>/, `<footer>${escape(report.scope)}<br>Result: ${escape(report.error ?? JSON.stringify(report.providerValidation ?? { observationsComplete: report.observationsComplete }))}<br>Cleanup: ${escape(JSON.stringify(report.cleanup ?? { resourceCountAfter: report.resourceCountAfter, cloudGroupPreserved: report.cloudGroupPreserved }))}<br>Replay of retained timestamped observations, not a live video or Portal screenshot. Template SHA-256: ${escape(report.templateSha256 ?? 'not recorded')}. Event SHA-256: ${createHash('sha256').update(raw).digest('hex')}.</footer>`);
template = template.replace('<!--CAPTURE-->', `<script id="capture" type="application/json">${JSON.stringify(events).replaceAll('<', '\\u003c')}</script>`);
await writeFile(resolve(root, 'replay.html'), template, { mode: 0o600 });
console.log(resolve(root, 'replay.html'));
