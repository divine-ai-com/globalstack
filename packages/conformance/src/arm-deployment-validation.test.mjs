import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { validateDeployment } from '../../azure-control-plane/src/deployment-validation.mjs';
import { validateSearchServiceName } from '../../azure-control-plane/src/search-validation.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';

const subscriptionId = '00000000-0000-0000-0000-000000000000';
const deploymentName = 'independent-validation';
const route = `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/${deploymentName}`;
const captured = JSON.parse(await readFile(new URL('../../../experiments/production-scenarios/evidence/validation.json', import.meta.url)));
const request = index => JSON.parse(JSON.stringify(captured.attempts[index].targets[0].request)
  .replaceAll('<subscription>', subscriptionId).replaceAll('<deployment>', deploymentName).replaceAll('<group>', 'rg-independent'));
const validate = body => validateDeployment({ subscriptionId, deploymentName, body });

test('frozen Azure requests distinguish template and provider checks without mutation', async () => {
  const store = new ResourceStore();
  let callbacks = 0;
  const server = createArmServer({ store, onResourcePut: () => callbacks++, onResourceDelete: () => callbacks++ });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const send = (method, path, body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    for (const [index, expected] of [[0, 400], [1, 200], [2, 400], [3, 200]]) {
      const response = await send('POST', `${route}/validate?api-version=2025-04-01`, request(index));
      assert.equal(response.status, expected);
      const body = await response.json();
      if (index === 0) {
        assert.equal(body.error.code, 'InvalidTemplate');
        assert.equal(body.error.additionalInfo[0].info.path, 'properties.template.parameters.location');
      }
      if (index === 2) {
        assert.equal(body.error.code, 'InvalidTemplateDeployment');
        assert.equal(body.error.details[0].code, 'InvalidServiceName');
      }
      if (expected === 200) assert.equal(body.properties.provisioningState, 'Succeeded');
    }
    assert.deepEqual(store.listResourceGroups(subscriptionId), []);
    assert.equal(store.getDeployment({ subscriptionId, deploymentName }), null);
    assert.equal(callbacks, 0);
    for (const method of ['PUT', 'DELETE', 'GET']) {
      const response = await send(method, `${route}/validate?api-version=2025-04-01`, method === 'PUT' ? request(3) : undefined);
      assert.ok(response.status >= 400, `${method} on an action must not deploy or read the parent`);
      await response.arrayBuffer();
    }
    assert.deepEqual(store.listResourceGroups(subscriptionId), []);
    assert.equal(callbacks, 0);
    const noVersion = await send('POST', `${route}/validate`, request(3));
    assert.equal(noVersion.status, 400);
    assert.equal((await noVersion.json()).error.code, 'MissingApiVersionParameter');
    store.putResourceGroup(subscriptionId, 'rg-independent', { location: 'eastus2' });
    const invalidPut = await send('PUT', `/subscriptions/${subscriptionId}/resourceGroups/rg-independent/providers/Microsoft.Search/searchServices/Bad_Name?api-version=2025-05-01`, {
      location: 'eastus2', sku: { name: 'basic' }, properties: {},
    });
    assert.equal(invalidPut.status, 400);
    assert.equal((await invalidPut.json()).error.code, 'InvalidServiceName');
    assert.equal(callbacks, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('Search name validation applies to unrelated names and documented boundaries', () => {
  for (const name of ['ab', 'another-search-42', 'a'.repeat(60)]) assert.equal(validateSearchServiceName(name), null);
  for (const name of ['Aaa', 'abc_def', '-abc', 'abc-', 'abc--def', 'a', 'a'.repeat(61)]) {
    assert.equal(validateSearchServiceName(name).code, 'InvalidServiceName');
    const body = request(3);
    body.properties.parameters.serviceName.value = name;
    assert.equal(validate(body).body.error.details[0].code, 'InvalidServiceName');
    body.properties.validationLevel = 'Template';
    assert.equal(validate(body).status, 200);
  }
});

test('missing nested parameters cannot borrow an unrelated parent parameter', () => {
  const body = request(3);
  delete body.properties.template.resources[1].properties.parameters.location;
  const result = validate(body);
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'InvalidTemplate');
  assert.equal(result.body.error.additionalInfo[0].info.path, 'properties.template.resources.1.properties.template.parameters.location');
});

test('parameter types, defaults, bounds and allowed values are checked before expansion', () => {
  const template = { contentVersion: '1.0.0.0', parameters: {
    count: { type: 'int', defaultValue: 3, minValue: 1, maxValue: 4 },
    label: { type: 'string', defaultValue: 'abc', minLength: 2, maxLength: 4, allowedValues: ['abc', 'de'] },
    enabled: { type: 'bool', defaultValue: true },
    items: { type: 'array', defaultValue: ['a'], minLength: 1 },
  }, resources: [] };
  const body = { location: 'eastus2', properties: { mode: 'Incremental', template } };
  assert.equal(validate(body).status, 200);
  for (const parameters of [
    { count: { value: '3' } }, { count: { value: 0 } }, { count: { value: 5 } },
    { label: { value: 'z' } }, { enabled: { value: 'true' } }, { items: { value: [] } },
    { extra: { value: 'not-declared' } },
  ]) assert.equal(validate({ ...body, properties: { ...body.properties, parameters } }).status, 400);
});

test('malformed input and unsupported validation surfaces do not report success', () => {
  for (const body of [null, [], {}, { properties: {} }, { properties: { mode: 'Incremental', template: [] } }]) {
    assert.equal(validate(body).status, 400);
  }
  for (const mutate of [
    body => { body.properties.templateLink = { uri: 'https://example.invalid/template' }; },
    body => { body.properties.parameters.location = { reference: { keyVault: { id: 'unused' }, secretName: 'unused' } }; },
    body => { body.properties.template.resources[0].copy = { count: 2 }; },
    body => { body.properties.template.resources[1].properties.template.resources[0].type = 'Microsoft.Example/widgets'; },
    body => { body.properties.template.resources[0].location = "[uniqueString('unsupported')]"; },
  ]) {
    const body = request(3);
    mutate(body);
    const result = validate(body);
    assert.equal(result.status, 501);
    assert.equal(result.body.error.code, 'GlobalStackValidationNotImplemented');
  }
});

test('validation does not echo secure parameter values', () => {
  const body = { properties: { mode: 'Incremental', template: {
    parameters: { password: { type: 'securestring' }, options: { type: 'secureobject' } }, resources: [],
  }, parameters: { password: { value: 'synthetic-sensitive-value' }, options: { value: { secret: 'synthetic-object-value' } } } } };
  const result = validate(body);
  assert.equal(result.status, 200);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-sensitive-value|synthetic-object-value/);
  assert.equal(result.body.properties.parameters.password.type, 'Securestring');
});
