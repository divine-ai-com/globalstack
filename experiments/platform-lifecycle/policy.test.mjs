import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { platforms } from './platforms.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';
import { additionalPolicy, deploymentBody } from './policy.mjs';

const template = JSON.parse(await readFile(new URL('./fixtures/arm/main.json', import.meta.url)));
const context = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-pair-123456abcdef', runId: '123456abcdef', location: 'eastus', expires: '2099-01-01T00:00:00Z' };
const path = `/subscriptions/${context.subscription}/providers/Microsoft.Resources/deployments/${context.group}?api-version=2022-09-01`;
const url = new URL(path, 'https://management.azure.com');

test('the matrix covers every registered Azure platform with an explicit family', () => {
  assert.deepEqual(platforms.map(platform => platform.id), azurePlatforms.map(platform => platform.id));
  assert.equal(platforms.length, 9);
  assert.ok(platforms.every(platform => platform.family && platform.fixture && platform.image));
});

test('template write scope rejects changed resources, parameters, origins and other deployments', () => {
  const allowed = additionalPolicy(context, template);
  const body = deploymentBody(template, context, 'one');
  assert.equal(allowed('PUT', url, body), true);
  assert.equal(allowed('PUT', url, deploymentBody(template, context, 'two')), true);
  assert.equal(allowed('GET', url), true);
  assert.equal(allowed('DELETE', url), true);
  const extraResource = structuredClone(body);
  extraResource.properties.template.resources.push({ type: 'Microsoft.Compute/virtualMachines', name: 'unexpected' });
  assert.equal(allowed('PUT', url, extraResource), false);
  const otherGroup = structuredClone(body);
  otherGroup.properties.parameters.groupName.value = 'someone-elses-group';
  assert.equal(allowed('PUT', url, otherGroup), false);
  assert.equal(allowed('PUT', new URL(path, 'https://attacker.invalid'), body), false);
  assert.equal(allowed('PUT', new URL(path.replace(context.group, 'another-deployment'), url), body), false);
  assert.equal(allowed('GET', new URL(path.replace(context.group, 'another-deployment'), url)), false);
  assert.equal(additionalPolicy(context)('PUT', url, body), false);
  const inventory = new URL(`https://management.azure.com/subscriptions/${context.subscription}/resourceGroups/${context.group}/resources?api-version=2022-09-01`);
  assert.equal(allowed('GET', inventory), true);
  assert.equal(allowed('PUT', inventory, {}), false);
  assert.equal(allowed('GET', new URL(inventory.href.replace(context.group, 'another-group'))), false);
});
