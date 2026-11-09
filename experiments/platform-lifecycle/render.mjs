import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { platforms } from './platforms.mjs';
import { validateCapture } from './validate.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(await readFile(resolve(root, 'evidence/index.json'), 'utf8'));
assert.deepEqual(index.platforms.map(item => item.id), platforms.map(item => item.id));
const html = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const pending = 'See separate live pair; Portal capture pending';
const rows = [];
let nativeCount = 0, exchangeCount = 0;
for (const item of index.platforms) {
  const platform = platforms.find(platform => platform.id === item.id);
  const raw = await readFile(resolve(root, 'evidence', item.local));
  assert.equal(createHash('sha256').update(raw).digest('hex'), item.sha256);
  const report = JSON.parse(raw);
  validateCapture(report, platform);
  for (const [file, digest] of Object.entries(report.source)) assert.equal(createHash('sha256').update(await readFile(resolve(root, 'fixtures', platform.fixture, file))).digest('hex'), digest, 'Fixture differs from retained source');
  assert.equal(report.platform, item.id);
  assert.equal(report.sourceDirty, false, 'Published final local captures require a clean source revision');
  assert.equal(report.ok, true);
  assert.equal(report.targets.length, 1);
  const local = report.targets[0];
  assert.equal(local.name, 'local');
  assert.equal(local.ok, true);
  assert.equal(local.sourceUnchanged, true);
  assert.equal(local.cleanup.absent, true);
  assert.equal(local.cleanup.privateFilesRemoved, true);
  assert.equal(local.cleanup.nativeDestroy, true);
  for (const phase of local.phases) {
    assert.ok(phase.expectedExitCodes.includes(phase.exitCode) && !phase.timedOut);
    assert.ok(Date.parse(phase.completedAt) >= Date.parse(phase.startedAt));
  }
  for (const trace of local.traces) {
    assert.ok(trace.request && trace.response && !trace.blocked && !trace.transportError);
    assert.ok(local.phases.some(phase => phase.phase === trace.phase && phase.startedAt <= trace.startedAt && phase.completedAt >= trace.completedAt), 'An exchange has no matching command interval');
  }
  nativeCount += local.phases.length; exchangeCount += local.traces.length;
  rows.push({ item, platform, report, local });
}
const introduction = 'Nine native Azure platform implementations of one empty-resource-group lifecycle. This page contains local captures only. All nine native Azure pairs are recorded separately in LIVE.md. Azure Portal screenshots remain pending. The earlier Terraform pair is retained separately and does not satisfy the Portal screenshot requirement.';
const notes = [
  'Each record preserves actual command arguments, exit status, UTC start/end times, bounded sanitized output, and selected ARM request/response fields. Direct probes and cleanup evidence remain separate from native commands.',
  'Source hashes and image IDs identify each run. The fixtures contain no branch for the target environment. External credentials and routing select the target; identity acquisition is not being compared.',
  'No Azure Portal screenshot is included in this local-only record. Screenshots of a generated report are not substitutes for Portal evidence. Per-stage Azure cells on this page are not populated from the separate live-run ledger.',
  'Command timing includes container and provider overhead. These single runs are not a speed benchmark. No data-plane, application-event or broad service-compatibility conclusion follows from an empty resource group.',
  'A native command can produce several API calls. State/import applies only to the HCL and Pulumi families. Bicep/ARM compilation and az rest template submission are distinct from az deployment command coverage.',
];
const title = 'Native platform lifecycle snapshots';
const md = `# ${title}\n\n${introduction}\n\n[Tool-specific lifecycle plan](PLAN.md) · [Recorded live pairs](LIVE.md) · [Downloadable offline comparison](SNAPSHOTS.html) · [Earlier Terraform paired snapshots](../paired-lifecycle/SNAPSHOTS.md)\n\n## Coverage\n\n| Platform | Local command stages | Native ARM exchanges | Azure |\n| --- | ---: | ---: | --- |\n${rows.map(({ platform, local }) => `| [${platform.label}](#${platform.id}) | ${local.phases.length} | ${local.traces.length} | ${pending} |`).join('\n')}\n\nThe final local matrix contains ${nativeCount} command stages and ${exchangeCount} native ARM exchanges across nine platform implementations. These are nine implementations of one scenario, not nine independent architectures.\n\n## Reading the snapshots\n\n${notes.map(note => `- ${note}`).join('\n')}\n\n` + rows.map(({ platform, local, report, item }) => `<a id="${platform.id}"></a>\n\n## ${platform.label}\n\nLifecycle recorded: ${local.phases.map(phase => phase.phase).join(' → ')}.\n\nSource revision: \`${report.revision}\`. [Retained JSON](evidence/${item.local}). All reported stages completed and cleanup confirmed absence.\n\n| Stage | GlobalStack command outcome | Azure |\n| --- | --- | --- |\n${local.phases.map(phase => `| ${phase.phase} | Exit ${phase.exitCode}; ${local.traces.filter(trace => trace.phase === phase.phase && phase.startedAt <= trace.startedAt && phase.completedAt >= trace.completedAt).map(trace => `${trace.method} ${trace.status}`).join(' → ') || 'no ARM exchange captured'} | See [live pair](LIVE.md) |`).join('\n')}\n\nThe HTML expands command output, request/response snapshots, independent probes and cleanup.\n`).join('\n');
const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>body{font:16px/1.55 system-ui,sans-serif;background:#f4f7fb;color:#172c42;margin:0}main{max-width:1200px;margin:auto;padding:32px}a{color:#174b9b}nav{display:flex;gap:10px;flex-wrap:wrap}nav a{background:white;padding:8px;border:1px solid #ccd6e3;border-radius:6px}section{background:white;border:1px solid #ccd6e3;border-radius:8px;padding:24px;margin:24px 0}article{border-top:1px solid #ccd6e3;margin-top:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pair>div{min-width:0}pre{font:13px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:#f1f4f8}summary{cursor:pointer;font-weight:600;padding:8px 0}.pending{color:#7b4d00;background:#fff5dd;padding:14px}small{color:#44556a}@media(max-width:760px){main{padding:16px}.pair{grid-template-columns:1fr}}</style></head><body><main><h1>${title}</h1><p>${introduction}</p><nav aria-label="Platforms">${rows.map(({ platform }) => `<a href="#${platform.id}">${html(platform.label)}</a>`).join('')}</nav><p>${nativeCount} command stages and ${exchangeCount} native ARM exchanges. One scenario, nine implementations.</p><ul>${notes.map(note => `<li>${html(note)}</li>`).join('')}</ul>` + rows.map(({ platform, local, report }) => `<section id="${platform.id}"><h2>${html(platform.label)}</h2><p>${local.phases.map(phase => html(phase.phase)).join(' → ')}</p><small>Source ${html(report.revision)}. Native cleanup and independent absence checks passed.</small>${local.phases.map((phase, ordinal) => {
  const traces = local.traces.filter(trace => trace.phase === phase.phase && phase.startedAt <= trace.startedAt && phase.completedAt >= trace.completedAt);
  return `<article><h3>${ordinal + 1}. ${html(phase.phase)}</h3><pre>${html(phase.command.join(' '))}</pre><div class="pair"><div><h4>GlobalStack</h4><p>Exit ${phase.exitCode}; ${html(traces.map(trace => `${trace.method} ${trace.status}`).join(' → ') || 'No ARM exchange captured')}.</p><details><summary>Command outcome and output</summary><pre>${html(JSON.stringify(phase, null, 2))}</pre></details><details><summary>Request and response snapshots (${traces.length})</summary><pre>${html(JSON.stringify(traces, null, 2))}</pre></details></div><div><h4>Azure</h4><p class="pending">${pending}</p></div></div></article>`;
}).join('')}<details><summary>Independent probes and cleanup</summary><pre>${html(JSON.stringify({ probes: local.probes, cleanup: local.cleanup }, null, 2))}</pre></details><details><summary>Source and tool identity</summary><pre>${html(JSON.stringify({ revision: report.revision, source: report.source, image: report.image, publication: report.publication }, null, 2))}</pre></details></section>`).join('') + '</main></body></html>\n';
for (const [name, content] of Object.entries({ 'SNAPSHOTS.md': md, 'SNAPSHOTS.html': document })) {
  if (process.argv.includes('--check')) assert.equal(await readFile(resolve(root, name), 'utf8'), content, `Stale platform snapshots: ${name}`);
  else await writeFile(resolve(root, name), content);
}
console.log(`Verified ${rows.length} local platforms, ${nativeCount} command stages and ${exchangeCount} ARM exchanges. Live pairs are recorded separately; Portal screenshots remain pending.`);
