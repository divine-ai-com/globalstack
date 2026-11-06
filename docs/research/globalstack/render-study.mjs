import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { flowStudyCases } from '../../../scripts/e2e/flow-study-cases.mjs';
import { assessFlowEpisode, checkNames, summarizeFlowStudy } from '../../../scripts/e2e/flow-study-oracles.mjs';

const root = new URL('./study/evidence/', import.meta.url);
const record = JSON.parse(await readFile(new URL('results.json', root), 'utf8'));
assert.equal(record.schemaVersion, 1);
assert.match(record.sourceRevision, /^[a-f0-9]{40}$/);
assert.equal(record.workingTreeDirty, false);
assert.equal(record.repetitions, 3);
assert.deepEqual(record.cases, flowStudyCases);
for (const [file, digest] of Object.entries(record.digests)) {
  assert.equal(createHash('sha256').update(await readFile(new URL(`../../../${file}`, import.meta.url))).digest('hex'), digest, file);
}
assert.equal(record.attempts.length, flowStudyCases.length * record.repetitions);
assert.equal(new Set(record.attempts.map(a => `${a.repetition}/${a.caseId}`)).size, record.attempts.length);
const ids = new Set();
for (let index = 0; index < record.attempts.length; index += 1) {
  const attempt = record.attempts[index];
  const definition = flowStudyCases[index % flowStudyCases.length];
  assert.equal(attempt.caseId, definition.id);
  assert.equal(attempt.repetition, Math.floor(index / flowStudyCases.length) + 1);
  assert.equal(attempt.error, null, JSON.stringify(attempt.error));
  assert.equal(attempt.result.cleanupVerified, true);
  assert.deepEqual(attempt.result.episodes.map(e => e.label), ['connected', 'mutated', 'restored']);
  for (const episode of attempt.result.episodes) {
    assert.equal(episode.scenario, definition.scenario);
    assert.ok(!ids.has(episode.input.requestId)); ids.add(episode.input.requestId);
    const data = { requestId: episode.input.requestId, course: episode.input.course };
    const expected = definition.scenario === 'vault-enrichment' ? { ...data, office: 'curriculum-office' } : [{
      id: episode.input.requestId, subject: 'course-feed', eventType: 'Course.Ready', eventTime: episode.input.eventTime, dataVersion: '1.0', data,
    }];
    assert.deepEqual(episode.expectedPayload, expected);
    assert.ok(episode.observedBoundaries.some(hop => hop.requestId === episode.input.requestId));
    const checks = assessFlowEpisode(episode);
    assert.equal(checks.exclusiveOutcome, episode.label !== 'mutated');
    if (episode.label !== 'mutated') assert.ok(Object.values(checks).every(Boolean));
  }
  const mutation = attempt.result.episodes[1];
  const paths = mutation.deliveries.map(delivery => delivery.path).sort();
  const body = mutation.deliveries[0]?.body;
  // Check the observed fault witness independently of the aggregate rejection counts.
  switch (definition.mutation) {
    case 'wrong-config-reference': assert.equal(body.office, 'unrelated-office'); break;
    case 'missing-config-reference': assert.ok(mutation.observedBoundaries.some(h => h.status === 404)); assert.deepEqual(paths, []); break;
    case 'wrong-destination': assert.deepEqual(paths, ['/wrong']); break;
    case 'wrong-course': assert.equal(definition.scenario === 'vault-enrichment' ? body.course : body[0].data.course, 'WRONG-COURSE'); break;
    case 'duplicate-delivery': assert.deepEqual(paths, ['/accepted', '/accepted']); break;
    case 'extra-destination': assert.deepEqual(paths, ['/accepted', '/wrong']); break;
    case 'deleted-subscription': assert.deepEqual(paths, []); assert.equal(mutation.workflowStatus, 'Succeeded'); break;
    case 'wrong-version-type': assert.ok(mutation.observedBoundaries.some(h => h.status === 400)); assert.deepEqual(paths, []); break;
    default: assert.fail('Unknown mutation');
  }
}
const summary = summarizeFlowStudy(record.attempts);
assert.deepEqual(record.summary, summary);
assert.equal(summary.inconclusiveCases, 0);
for (const filename of ['initial-results.json', 'setup-corrected-results.json', 'public-reproduction.json']) {
  const earlier = JSON.parse(await readFile(new URL(filename, root), 'utf8'));
  assert.deepEqual(earlier.summary, summarizeFlowStudy(earlier.attempts));
  assert.deepEqual(earlier.summary, summary, 'The measurement correction must not silently change results');
  for (let index = 0; index < record.attempts.length; index += 1) {
    assert.equal(earlier.attempts[index].caseId, record.attempts[index].caseId);
    assert.equal(earlier.attempts[index].error, null);
    assert.deepEqual(earlier.attempts[index].result.episodes.map(assessFlowEpisode), record.attempts[index].result.episodes.map(assessFlowEpisode));
  }
}
const first = record.attempts.filter(attempt => attempt.repetition === 1);
for (const attempt of record.attempts) {
  const reference = first.find(item => item.caseId === attempt.caseId);
  assert.deepEqual(attempt.result.episodes.map(assessFlowEpisode), reference.result.episodes.map(assessFlowEpisode));
}
const names = ['Management acceptance', 'Workflow success', 'Intended arrival', 'Exact at target', 'Exclusive outcome'];
const tex = text => String(text).replace(/[\\{}$&#_%]/g, char => `\\${char}`);
const line = cells => cells.map(tex).join(' & ') + String.raw` \\`;
const count = key => first.filter(attempt => !assessFlowEpisode(attempt.result.episodes[1])[key]).length;
const measurements = {
  StudyCases: flowStudyCases.length, StudyRepetitions: record.repetitions, StudyEpisodes: summary.observedEpisodes,
  StudyPositives: summary.observedPositiveEpisodes, StudyMutants: summary.observedMutatedEpisodes,
  StudyManagementCaught: count('management'), StudyWorkflowCaught: count('workflow'), StudyArrivalCaught: count('arrival'),
  StudyExactCaught: count('exactAtTarget'), StudyExclusiveCaught: count('exclusiveOutcome'),
};
await writeFile(new URL('measurements.tex', root), Object.entries(measurements).map(([name, value]) => `\\newcommand{\\${name}}{${value}}`).join('\n') + '\n');
await writeFile(new URL('check-rows.tex', root), String.raw`\begin{tabular}{lrrr}\toprule
${line(['Check', 'Distinct faults', 'Repeated faults', 'Positive rejected'])}\midrule
${checkNames.map((key, i) => line([names[i], `${count(key)}/${flowStudyCases.length}`, `${summary.checks[key].rejectedMutated}/${summary.observedMutatedEpisodes}`, `${summary.checks[key].rejectedPositive}/${summary.observedPositiveEpisodes}`])).join('\n')}
\bottomrule\end{tabular}
`);
await writeFile(new URL('case-rows.tex', root), String.raw`\begin{tabular}{lllccccc}\toprule
${line(['Flow', 'Mutation', 'Class', 'M', 'W', 'A', 'T', 'E'])}\midrule
${first.map(attempt => {
  const definition = flowStudyCases.find(item => item.id === attempt.caseId);
  const checks = assessFlowEpisode(attempt.result.episodes[1]);
  return line([definition.scenario === 'vault-enrichment' ? 'Vault' : 'Events', definition.mutation, definition.faultClass, ...checkNames.map(key => checks[key] ? '.' : 'X')]);
}).join('\n')}
\bottomrule\end{tabular}
`);
await writeFile(new URL('bars.tex', root), checkNames.map((key, i) => String.raw`\node[anchor=east] at (0,${5 - i}) {${names[i]}};
\fill[${i === 4 ? 'good' : 'ink!65'}] (0,${4.65 - i}) rectangle (${count(key)},${5.35 - i});
\node[anchor=west] at (${count(key)},${5 - i}) {${count(key)}/12};`).join('\n') + '\n');
console.log('Study traces, source digests, fault witnesses and repeated results verified.');
