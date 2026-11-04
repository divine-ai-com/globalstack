import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { classifyAzureCapture, shallowAzureErrorCodes } from './azure-capture-classification.mjs';

const fixtureRoot = new URL('../../../fixtures/azure-captures/', import.meta.url);

test('Azure captures are cleanup-verified and classified without cloud-validation claims', async () => {
  const entries = await readdir(fixtureRoot);
  const fixtures = [];
  for (const entry of entries.filter(name => name.endsWith('.json'))) {
    fixtures.push(JSON.parse(await readFile(join(fixtureRoot.pathname, entry), 'utf8')));
  }

  assert.ok(fixtures.length > 0, 'expected at least one Azure capture fixture');
  for (const fixture of fixtures) {
    assert.equal(fixture.cleanup?.verifiedDeleted, true, `${fixture.id} cleanup was not verified`);
    const classification = classifyAzureCapture(fixture);
    assert.equal(classification.cloudValidated, false, `${fixture.id} must not become cloudValidated from capture alone`);
    assert.equal(fixture.globalstack?.cloudValidated, false, `${fixture.id} fixture must carry cloudValidated=false`);
    assert.equal(fixture.globalstack?.validationDepth, classification.depth, `${fixture.id} has stale validationDepth`);
  }
});

test('Provider registration failures are marked shallow when present', async () => {
  const entries = await readdir(fixtureRoot);
  let shallowCount = 0;
  for (const entry of entries.filter(name => name.endsWith('.json'))) {
    const fixture = JSON.parse(await readFile(join(fixtureRoot.pathname, entry), 'utf8'));
    if (shallowAzureErrorCodes.has(fixture.response?.body?.error?.code)) {
      shallowCount += 1;
      assert.equal(fixture.globalstack.validationDepth, 'subscription-or-provider-readiness');
    }
  }
  assert.equal(Number.isInteger(shallowCount), true);
});

test('transient namespace state and subscription quota do not prove parameter validation', () => {
  for (const [code, message, status] of [
    ['NamespaceInTransition', 'The namespace is Creating.', 429],
    ['Unauthorized', 'Operation cannot be completed without additional quota.', 401],
  ]) {
    const result = classifyAzureCapture({ response: { status, body: { error: { code, message } } } });
    assert.equal(result.depth, 'capture-infrastructure-gap');
    assert.equal(result.cloudValidated, false);
  }
  assert.equal(classifyAzureCapture({ response: { status: 400, body: { error: { code: 'InvalidParameterValue', message: 'Invalid value.' } } } }).depth, 'provider-validation');
});
