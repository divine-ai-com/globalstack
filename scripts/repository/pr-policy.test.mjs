import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePullRequest } from './pr-policy.mjs';

const body = '## Why\nInvalid requests were accepted.\n\n## What changed\nReject malformed tags.\n\n## How it was tested\nRan the captured Azure replay suite.';
test('accepts a complete contributor PR and automated dependency branch', () => {
  assert.deepEqual(validatePullRequest({ title: 'fix(arm): reject invalid tags', body, head: 'fix/request-validation' }), []);
  assert.deepEqual(validatePullRequest({ title: 'build(deps): update yaml', body, head: 'dependabot/npm_and_yarn/yaml-2.9.0' }), []);
});
test('rejects missing content, unknown scope and invalid title conventions', () => {
  for (const title of ['Update things', 'fix(api): add validation', 'fix(arm): Add validation', 'fix: add validation.', `fix: ${'a'.repeat(73)}`]) {
    assert.ok(validatePullRequest({ title, body }).length > 0, title);
  }
  assert.equal(validatePullRequest({ title: 'fix: add validation', body: '## Why\n<!-- fill me -->\n## What changed\n\n## How it was tested\n' }).length, 3);
  assert.ok(validatePullRequest({ title: 'fix: add validation', body, head: 'my branch' }).length);
});
test('requires migration details for a breaking change', () => {
  assert.ok(validatePullRequest({ title: 'feat(arm)!: change resource IDs', body }).length);
  assert.deepEqual(validatePullRequest({ title: 'feat(arm)!: change resource IDs', body: `${body}\n\n## Breaking changes\nRegenerate local resource IDs before deployment.` }), []);
});
