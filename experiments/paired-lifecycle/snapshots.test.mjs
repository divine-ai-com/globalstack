import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildSnapshots, renderHtml } from './render-snapshots.mjs';

const report = JSON.parse(await readFile(new URL('./evidence/corrected.json', import.meta.url)));

test('snapshots retain every exchange and probe without filling unobserved state', () => {
  const snapshots = buildSnapshots(report, 'test-digest');
  assert.equal(snapshots.stages.length, 21);
  for (const target of report.targets) {
    const retained = snapshots.stages.map(stage => stage.targets[target.name]);
    assert.deepEqual(retained.flatMap(stage => stage.traces), target.traces);
    assert.deepEqual(retained.flatMap(stage => stage.probes), target.probes);
    assert.deepEqual(snapshots.stages.filter(stage => stage.kind === 'native').map(stage => stage.targets[target.name].outcome), target.phases);
    assert.deepEqual(retained.at(-1).outcome, target.cleanup);
  }
  const destroy = snapshots.stages.find(stage => stage.id === 'destroy');
  assert.equal(destroy.targets.local.traces.at(-1).status, 200);
  assert.equal(destroy.targets.azure.traces.at(-2).status, 202);
  assert.equal(destroy.targets.azure.traces.at(-1).status, 200);
  assert.equal(destroy.comparisons.exchanges.filter(item => item.unmatched === 'azure').length, 1);
  assert.deepEqual(snapshots.stages.find(stage => stage.id === 'state-remove').targets.azure.traces, []);
});

test('snapshot generation refuses missing probes and unknown observations', () => {
  const missing = structuredClone(report);
  missing.targets[0].probes.pop();
  assert.throws(() => buildSnapshots(missing, 'test-digest'));
  const unknown = structuredClone(report);
  unknown.targets[1].traces.push({ phase: 'unmapped-operation' });
  assert.throws(() => buildSnapshots(unknown, 'test-digest'), /Unmapped phase/);
});

test('HTML treats recorded payloads as text and contains no executable script', () => {
  const data = buildSnapshots(structuredClone(report), 'test-digest');
  data.stages[0].targets.local.probes[0].body = '</pre><script>alert(1)</script>';
  const html = renderHtml(data);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(html.includes('<script'), false);
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes('GET 200'));
});
