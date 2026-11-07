import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { differences, semanticHeaders } from '../paired-lifecycle/compare.mjs';
import { platforms } from './platforms.mjs';
import { validateCapture } from './validate.mjs';

export function compareNative(report) {
  const platform = platforms.find(item => item.id === report.platform);
  assert.ok(platform);
  const local = report.targets.find(item => item.name === 'local');
  const azure = report.targets.find(item => item.name === 'azure');
  assert.ok(local && azure, 'Both target attempts are required for comparison');
  assert.deepEqual(local.source, azure.source, 'Compared targets must use identical source');
  let lifecyclePassed = false, validationError;
  try { lifecyclePassed = validateCapture(report, platform); } catch (error) { validationError = error.message; }
  const buckets = target => {
    const map = new Map();
    for (const trace of target.traces) {
      const key = `${trace.phase} ${trace.method} ${trace.path}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(trace);
    }
    return map;
  };
  const left = buckets(local), right = buckets(azure), exchanges = [];
  for (const operation of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(operation) ?? [], b = right.get(operation) ?? [];
    for (let occurrence = 0; occurrence < Math.max(a.length, b.length); occurrence++) {
      const x = a[occurrence], y = b[occurrence];
      if (!x || !y) { exchanges.push({ operation, occurrence, unmatched: x ? 'local' : 'azure' }); continue; }
      const selected = trace => ({ request: trace.request, status: trace.status, response: { ...trace.response, headers: semanticHeaders(trace.response?.headers) }, blocked: trace.blocked, transportError: trace.transportError });
      exchanges.push({ operation, occurrence, differences: differences(selected(x), selected(y)) });
    }
  }
  return { schemaVersion: 1, platform: report.platform, revision: report.revision, lifecyclePassed, validationError,
    portalEvidenceComplete: report.portalEvidenceComplete === true,
    traceCounts: { local: local.traces.length, azure: azure.traces.length },
    pairedExchanges: exchanges.filter(item => !item.unmatched).length,
    unmatchedExchanges: exchanges.filter(item => item.unmatched).length,
    exchangesWithDifferences: exchanges.filter(item => item.differences?.length).length,
    interpretation: 'Lifecycle success is separate from API equivalence. These selected fields and one scenario cannot establish 100% Azure compatibility. Video is a walkthrough, not proof of equivalence.',
    normalization: 'Known private identifiers are sanitized before comparison. Request-ID and ETag values are compared by presence/type; other selected fields remain visible. Repeated requests are paired by phase, method, path and occurrence, not treated as independent scenarios.',
    probes: ['read-create', 'read-update', 'inject-drift', 'read-repair'].map(phase => ({ phase, differences: differences(local.probes.find(item => item.phase === phase)?.body, azure.probes.find(item => item.phase === phase)?.body) })),
    exchanges };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const comparison = compareNative(JSON.parse(await readFile(process.argv[2], 'utf8')));
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(comparison, null, 2) + '\n');
  const { exchanges, ...summary } = comparison;
  console.log(JSON.stringify(summary, null, 2));
  if (!comparison.lifecyclePassed) process.exitCode = 1;
}
