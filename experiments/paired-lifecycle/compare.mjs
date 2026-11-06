import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function differences(left, right, path = '', result = []) {
  if (JSON.stringify(left) === JSON.stringify(right)) return result;
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) differences(left[key], right[key], `${path}/${key}`, result);
  } else result.push({ path, local: left === undefined ? { missing: true } : left, azure: right === undefined ? { missing: true } : right });
  return result;
}

function semanticHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key,
    ['x-ms-request-id', 'x-ms-correlation-request-id', 'etag'].includes(key) ? { present: true, type: typeof value } : value]));
}

export function compare(report) {
  assert.equal(report.schemaVersion, 1);
  const local = report.targets.find(target => target.name === 'local');
  const azure = report.targets.find(target => target.name === 'azure');
  assert.ok(local && azure, 'A comparison requires both targets, including failed attempts');
  assert.deepEqual(local.source, azure.source, 'Source hashes differ');
  const key = event => `${event.phase} ${event.method} ${event.path}`;
  const buckets = target => {
    const result = new Map();
    for (const event of target.traces) { const id = key(event); if (!result.has(id)) result.set(id, []); result.get(id).push(event); }
    return result;
  };
  const left = buckets(local), right = buckets(azure);
  const exchanges = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(id) ?? [], b = right.get(id) ?? [];
    for (let occurrence = 0; occurrence < Math.max(a.length, b.length); occurrence++) {
      const x = a[occurrence], y = b[occurrence];
      if (!x || !y) { exchanges.push({ operation: id, occurrence, unmatched: x ? 'local' : 'azure' }); continue; }
      exchanges.push({ operation: id, occurrence, differences: differences(
        { request: x.request, status: x.status, response: { ...x.response, headers: semanticHeaders(x.response?.headers) } },
        { request: y.request, status: y.status, response: { ...y.response, headers: semanticHeaders(y.response?.headers) } },
      ) });
    }
  }
  return {
    schemaVersion: 1, source: report.source, lifecyclePassed: local.ok && azure.ok,
    traceCounts: { local: local.traces.length, azure: azure.traces.length },
    completePilot: local.ok && azure.ok && local.sourceUnchanged && azure.sourceUnchanged,
    pairedExchanges: exchanges.filter(item => !item.unmatched).length,
    unmatchedExchanges: exchanges.filter(item => item.unmatched).length,
    exchangesWithDifferences: exchanges.filter(item => item.differences?.length).length,
    interpretation: 'Observed differences require protocol review; successful native lifecycle does not imply identical API behavior. Repeated polls are retained, not counted as independent scenarios.',
    exclusions: ['Identity token acquisition and provider download are outside ARM capture', 'Request-ID and ETag values vary; presence and type remain compared, conditional ETag semantics require a later case', 'No data-plane observations in the empty-group pilot'],
    phases: differences(local.phases.map(({ phase, exitCode }) => ({ phase, exitCode })), azure.phases.map(({ phase, exitCode }) => ({ phase, exitCode }))),
    exchanges,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const result = compare(report);
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2) + '\n');
  const { exchanges, source, ...summary } = result;
  console.log(JSON.stringify(summary, null, 2));
  if (!result.completePilot) process.exitCode = 1;
}
