import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compare } from './compare.mjs';

// Commands describe the frozen runner, not retrospectively recorded process arguments.
const plan = 'terraform plan -input=false -detailed-exitcode -no-color';
const apply = 'terraform apply -auto-approve -input=false -no-color';
const steps = [
  ['preflight', 'probe', 'Check the group does not exist', 'Direct GET of the generated resource-group path', 'Refuse to modify an existing group. This is a runner probe, outside Terraform.'],
  ['version', 'native', 'Check Terraform version', 'terraform version -json', 'Check the pinned Terraform 1.17.1 executable.'],
  ['format', 'native', 'Check configuration format', 'terraform fmt -check', 'Check HCL formatting without changing the source.'],
  ['init', 'native', 'Initialize the working directory', 'terraform init -input=false -lockfile=readonly -no-color', 'Install the pinned provider and initialize Terraform. Provider downloads are outside ARM capture.'],
  ['validate', 'native', 'Validate configuration', 'terraform validate -no-color', 'Validate the configuration using the installed provider.'],
  ['plan-create', 'native', 'Plan creation', plan, 'Plan the new group with revision=one. Expected exit 2 means changes are planned.'],
  ['apply-create', 'native', 'Create the group', apply, 'Create and read the group. Apply computes its own plan; this run did not apply a saved plan file.'],
  ['plan-stable', 'native', 'Check for an empty plan', plan, 'Read the group and check that no change is needed.'],
  ['refresh', 'native', 'Refresh Terraform state', 'terraform apply -refresh-only -auto-approve -input=false -no-color', 'Refresh state from the remote group without requesting a configuration change.'],
  ['plan-update', 'native', 'Plan a tag update', plan, 'The runner changes the external revision input from one to two. HCL source remains unchanged.'],
  ['apply-update', 'native', 'Apply the tag update', apply, 'Update the desired revision tag to two and read back the group.'],
  ['read-update', 'probe', 'Verify the update independently', 'Direct GET of the resource-group path', 'Check revision=two outside the native provider trace.'],
  ['inject-drift', 'probe', 'Introduce external drift', 'Direct PATCH with existing tags and revision=external', 'Intentionally change the remote tag without changing Terraform inputs. This is a test action, not a Terraform deployment step.'],
  ['plan-drift', 'native', 'Detect the external drift', plan, 'Read revision=external and plan to restore the desired revision=two.'],
  ['apply-repair', 'native', 'Repair the drift', apply, 'Restore the desired tag and read back the group.'],
  ['read-repair', 'probe', 'Verify the repair independently', 'Direct GET of the resource-group path', 'Check revision=two outside the native provider trace.'],
  ['state-remove', 'native', 'Remove Terraform ownership', 'terraform state rm azapi_resource.group', 'Remove the resource from Terraform state without deleting the remote group.'],
  ['import', 'native', 'Import the existing group', 'terraform import -input=false -no-color azapi_resource.group /subscriptions/<subscription>/resourcegroups/<group>', 'Reattach the existing group to Terraform state. The recorded provider requests use API version 2025-04-01.'],
  ['plan-imported', 'native', 'Check the imported state', plan, 'Check that no change is needed after import. Retain both observed API versions.'],
  ['destroy', 'native', 'Destroy the group', 'terraform destroy -auto-approve -input=false -no-color', 'Read and delete the group. Preserve the different deletion responses and Azure polling request.'],
  ['cleanup', 'cleanup', 'Confirm absence and remove private files', 'Independent cleanup verification and private-file removal', 'The cleanup record reports confirmed absence and removal of credentials, certificates and state. It does not contain the full verification HTTP exchange.'],
];

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2);
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const limits = [
  'These snapshots reproduce the published sanitized record. Account identifiers, signed polling material and credentials are redacted; selected headers and parsed JSON bodies are retained, not all wire bytes.',
  'Command descriptions and step ordering come from the frozen runner. The original record has exit codes and durations but no command arguments or per-command start/end timestamps. ARM exchanges do have recorded UTC timestamps.',
  'No per-stage Terraform state files, saved plan JSON, console screenshots or full command logs are included in this published evidence. A stage without an ARM exchange is marked as such, without inventing a remote-state snapshot.',
  'Direct probes retain response status/body but not request headers, request bodies or timestamps. Cleanup retains result flags rather than a complete verification exchange.',
  'The targets ran sequentially on one host. Command durations include container/provider overhead and are not a performance comparison. Identity token acquisition and provider downloads are outside ARM capture.',
  'This is one Terraform/AzAPI empty-group lifecycle. It does not establish other providers, other IaC tools, invalid-input behavior, data-plane behavior or cross-service event delivery.',
];
const fixes = [
  ['Resource-group PATCH', 'Shared ARM resource-group route, for the requested subscription and group. No pilot name or tag is special-cased.', 'Valid tag updates, replacement of the supplied tag map, preservation of omitted fields and 404 for a missing group. Local regression also checks distinct group names and subscriptions.', 'No claim of complete validation for malformed payloads, location changes, other resource types or every API version.'],
  ['Public resource-group responses', 'Shared GET, PUT, PATCH and list responses omit the internal globalstack field.', 'Applies to resource-group callers regardless of which IaC tool sends the request. Local regression checks response shape and isolation.', 'Other resource families have not received this same audit.'],
  ['Deletion polling observer', 'Experiment transport, not the GlobalStack service implementation. It accepts only scoped read-only polling URLs granted by allowed upstream 202 responses.', 'Allows the native Azure provider to complete this deletion and preserves the extra polling exchange.', 'Still scoped to this empty-group pilot. It does not implement asynchronous deletion in GlobalStack or authorize arbitrary service operations.'],
];

export function buildSnapshots(report, evidenceSha256) {
  const comparison = compare(report);
  assert.equal(comparison.completePilot, true, 'Snapshots require a complete corrected pair; preserve failed attempts separately');
  const names = new Set(steps.map(([id]) => id));
  for (const target of report.targets) {
    for (const event of [...target.phases, ...target.probes, ...target.traces]) assert.ok(names.has(event.phase), `Unmapped phase: ${event.phase}`);
    for (const [id, kind] of steps) {
      if (kind === 'native') assert.equal(target.phases.filter(item => item.phase === id).length, 1);
      if (kind === 'probe') assert.equal(target.probes.filter(item => item.phase === id).length, 1);
    }
  }
  return {
    schemaVersion: 1,
    provenance: { evidence: 'corrected.json', evidenceSha256, revision: report.revision, sourceDirty: report.sourceDirty, source: report.source, image: report.image, startedAt: report.startedAt, completedAt: report.completedAt, location: report.location, publication: report.publication },
    limits,
    stages: steps.map(([id, kind, title, commandFromFrozenRunner, purpose], index) => ({
      number: index + 1, id, kind, title, commandFromFrozenRunner, purpose,
      targets: Object.fromEntries(report.targets.map(target => [target.name, {
        outcome: kind === 'native' ? target.phases.find(item => item.phase === id) : kind === 'cleanup' ? target.cleanup : null,
        traces: target.traces.filter(event => event.phase === id),
        probes: target.probes.filter(event => event.phase === id),
      }])),
      comparisons: { exchanges: comparison.exchanges.filter(item => item.operation.startsWith(`${id} `)), probes: comparison.probes.filter(item => item.operation.startsWith(`${id} `)) },
    })),
  };
}

function sequence(snapshot) {
  const events = [...snapshot.traces, ...snapshot.probes];
  return events.length ? events.map(event => `${event.method} ${event.status ?? 'no response'}`).join(' → ') : 'No ARM exchange captured';
}

function outcome(stage, name) {
  const snapshot = stage.targets[name];
  if (stage.kind === 'native') return `Exit ${snapshot.outcome.exitCode} (expected ${snapshot.outcome.expected}); ${snapshot.outcome.elapsedMs} ms. ${sequence(snapshot)}.`;
  if (stage.kind === 'cleanup') return `Native destroy: ${snapshot.outcome.nativeDestroy}; absent: ${snapshot.outcome.absent}; private files removed: ${snapshot.outcome.privateFilesRemoved}.`;
  return sequence(snapshot);
}

function differenceSummary(stage) {
  const { exchanges, probes } = stage.comparisons;
  const unmatched = exchanges.filter(item => item.unmatched);
  const paths = [...new Set([...exchanges, ...probes].flatMap(item => (item.differences ?? []).map(diff => diff.path)))];
  if (!exchanges.length && !probes.length) return stage.kind === 'cleanup' ? 'Both report successful cleanup; raw verification traffic is not retained.' : 'Command outcomes available; no captured ARM exchange to compare.';
  return [paths.length ? `Differing fields: ${paths.join(', ')}.` : 'Retained status/body fields agree.', ...unmatched.map(item => `Unmatched ${item.unmatched} exchange: ${item.operation}.`)].join(' ');
}

export function renderMarkdown(data) {
  return `# Terraform lifecycle snapshots\n\nSame HCL and provider lockfile, two targets: GlobalStack and Azure. This corrected empty-resource-group pilot passed all 16 command stages. The four direct probes and final cleanup are separate steps. Successful completion does not imply identical API behavior.\n\n` +
    `## Lifecycle before comparison\n\nCheck absence → version and format → initialize → validate → plan and create → check stability → refresh → plan and apply update → verify update → inject drift → detect and repair drift → verify repair → remove state ownership → import → check imported state → destroy → verify cleanup.\n\nThis is the lifecycle exercised by this experiment, not an exhaustive lifecycle for every Terraform resource.\n\n` +
    `## Recorded comparison\n\nExit 2 is expected for plans with changes. In this recording Azure deletion polling returned **GET 200** with an empty body. Both targets ended with confirmed absence.\n\n| Step | GlobalStack | Azure |\n| --- | --- | --- |\n` +
    data.stages.map(stage => `| ${stage.number}. [${stage.title}](#${stage.id}) | ${outcome(stage, 'local')} | ${outcome(stage, 'azure')} |`).join('\n') +
    `\n\n[Open the self-contained HTML](SNAPSHOTS.html) after downloading it for side-by-side expandable records. [Machine-readable snapshots](evidence/stage-snapshots.json) preserve all 41 native exchanges and eight direct-probe responses from [the original corrected record](evidence/corrected.json). The JSON is derived evidence, not a new run.\n\n## Capture boundaries\n\n` +
    data.limits.map(value => `- ${value}`).join('\n') +
    `\n\n## Scope of the fixes\n\n| Fix | Shared scope | What is checked | Remaining boundary |\n| --- | --- | --- | --- |\n` + fixes.map(row => `| ${row.join(' | ')} |`).join('\n') +
    `\n\nThe product fixes apply to the resource-group handler shared by clients. Passing this test does not prove every other use case works. The observer fix is a harness correction, while GlobalStack's synchronous deletion remains a product compatibility gap.\n\n## Stage details\n\n` +
    data.stages.map(stage => `<a id="${stage.id}"></a>\n\n### ${stage.number}. ${stage.title}\n\n${stage.purpose}\n\nCommand or action from the frozen runner:\n\n\`\`\`text\n${stage.commandFromFrozenRunner}\n\`\`\`\n\n- GlobalStack: ${outcome(stage, 'local')}\n- Azure: ${outcome(stage, 'azure')}\n- Comparison: ${differenceSummary(stage)}\n- Exact recorded fields: [snapshot ${stage.number}](SNAPSHOTS.html#${stage.id}) or \`stages[${stage.number - 1}]\` in the JSON.\n`).join('\n') +
    `\n## Provenance\n\n- Run source: [${data.provenance.revision}](https://github.com/divine-ai-com/globalstack/tree/${data.provenance.revision}/experiments/paired-lifecycle).\n- UTC interval: ${data.provenance.startedAt} to ${data.provenance.completedAt}. This was 7 November 2026 in Asia/Dubai.\n- SHA-256 of published corrected.json: \`${data.provenance.evidenceSha256}\`.\n- HCL, lockfile and tool image digests are retained in the JSON. Account-specific values remain redacted.\n- Regenerate with \`node experiments/paired-lifecycle/render-snapshots.mjs\`; verify without writing with \`--check\`.\n`;
}

export function renderHtml(data) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Terraform lifecycle snapshots</title><style>
body{font:16px/1.55 system-ui,sans-serif;color:#172c42;background:#f4f7fb;margin:0}main{max-width:1200px;margin:auto;padding:32px}h1,h2,h3{line-height:1.2}h1{font-size:34px}a{color:#174b9b}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}nav a{background:white;border:1px solid #b6c6db;border-radius:6px;padding:5px 10px;text-decoration:none}section{background:white;border:1px solid #ccd6e3;border-radius:8px;padding:24px;margin:24px 0;scroll-margin-top:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair>article{min-width:0;border-top:4px solid #2765ad}.pair>article+article{border-color:#008579}pre{font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f4f8;padding:14px;border-radius:4px}summary{cursor:pointer;font-weight:600;padding:8px 0}.note{border-left:4px solid #a76700;padding-left:16px}small{color:#44556a}table{width:100%;border-collapse:collapse}td,th{text-align:left;vertical-align:top;padding:12px;border:1px solid #ccd6e3}code{overflow-wrap:anywhere}@media(max-width:760px){main{padding:16px}.pair{grid-template-columns:1fr}section{padding:16px}}@media print{body{background:white}main{max-width:none;padding:0}nav{display:none}section{break-before:page;border:0}details{display:block}details::details-content{content-visibility:visible}pre{font-size:10px}.pair{grid-template-columns:1fr 1fr}}
</style></head><body><main><h1>Terraform lifecycle snapshots</h1><p>Unchanged HCL, Terraform 1.17.1 and AzAPI 2.13.0. One empty resource group on GlobalStack and real Azure. All 16 recorded command stages completed; protocol differences remain.</p><h2>Lifecycle before comparison</h2><p>Prepare → plan → create → check stability → refresh → update → inject drift → detect and repair → remove state ownership → import → check imported state → destroy → verify absence.</p><p>Four direct probes and cleanup are shown separately from native Terraform commands. Select a step, then expand either target's retained fields and the comparison.</p><nav aria-label="Lifecycle steps">${data.stages.map(stage => `<a href="#${stage.id}">${stage.number}. ${escape(stage.title)}</a>`).join('')}</nav><div class="note"><h2>What a snapshot contains</h2><ul>${data.limits.map(value => `<li>${escape(value)}</li>`).join('')}</ul></div>` +
    data.stages.map(stage => `<section id="${stage.id}"><small>Step ${stage.number} · ${escape(stage.kind)}</small><h2>${escape(stage.title)}</h2><p>${escape(stage.purpose)}</p><pre>${escape(stage.commandFromFrozenRunner)}</pre><small>Command or action reconstructed from the frozen runner.</small><div class="pair">${[['local', 'GlobalStack'], ['azure', 'Azure']].map(([name, title]) => `<article><h3>${title}</h3><p>${escape(outcome(stage, name))}</p><details><summary>Recorded outcome and exchanges</summary><pre>${escape(json(stage.targets[name]))}</pre></details></article>`).join('')}</div><p>${escape(differenceSummary(stage))}</p><details><summary>Compared fields and unmatched exchanges</summary><pre>${escape(json(stage.comparisons))}</pre></details></section>`).join('') +
    `<section><h2>Scope of the fixes</h2>${fixes.map(([title, scope, verified, limit]) => `<h3>${escape(title)}</h3><p>${escape(scope)} ${escape(verified)}</p><p>${escape(limit)}</p>`).join('')}<p>The corrections are shared resource-group behavior and a scoped observer change. They do not establish correctness of all services or all IaC tools.</p></section><section><h2>Provenance</h2><pre>${escape(json(data.provenance))}</pre><p>Derived from retained sanitized evidence. No new Azure deployment was needed to generate this view.</p></section></main></body></html>\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(resolve(root, 'evidence/corrected.json'));
  const data = buildSnapshots(JSON.parse(raw), hash(raw));
  const outputs = { 'evidence/stage-snapshots.json': json(data) + '\n', 'SNAPSHOTS.md': renderMarkdown(data), 'SNAPSHOTS.html': renderHtml(data) };
  for (const [name, content] of Object.entries(outputs)) {
    if (process.argv.includes('--check')) assert.equal(await readFile(resolve(root, name), 'utf8'), content, `Stale snapshot: ${name}`);
    else await writeFile(resolve(root, name), content);
  }
  console.log('Verified 16 command stages, four direct probes per target, cleanup and 41 native exchanges.');
}
