import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCorpus } from './generate-corpus.mjs';

test('synthetic seed corpus has twelve logical filings and pinned known answers', () => {
  const corpus = buildCorpus();
  assert.equal(corpus.logicalFilings, 12);
  assert.equal(corpus.physicalRevisions, 13);
  assert.equal(corpus.questions.length, 24);
  const byId = new Map(corpus.questions.map(question => [question.id, question]));
  assert.equal(byId.get('revenue-alpha-2025-h2').expected.value, '120');
  assert.equal(byId.get('revenue-alpha-2025-h2').expected.citations[0].documentId, 'alpha-2025-h2-r2');
  assert.equal(byId.get('margin-alpha-2024-h2').expected.value, '39.047619');
  assert.equal(byId.get('growth-alpha-2025-h2').expected.value, '14.285714');
  assert.equal(byId.get('revenue-beta-2026-h2').expected.value, '159');
  assert.equal(byId.get('revenue-beta-2026-h2').expected.citations[0].documentId, 'beta-2026-h2-r1');
  assert.equal(byId.get('missing-cash-flow-alpha-2026-h2').expected.outcome, 'abstain');
  assert.equal(byId.get('mixed-units-alpha-2026-h2').expected.outcome, 'reject');
  assert.match(corpus.files['beta-2026-h2-r1.txt'], /Untrusted note fixture/);
});
