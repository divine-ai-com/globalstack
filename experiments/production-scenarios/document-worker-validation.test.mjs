import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { validateDeployment } from '../../packages/azure-control-plane/src/deployment-validation.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';

// Names deliberately differ from the paired run so no captured value is hard-coded.
// The local ARM server accepts only its configured subscription.
const subscriptionId = '00000000-0000-0000-0000-000000000000';
const group = 'rg-worker-validation';
const service = 'gsindependent7';
const load = async name => {
  const text = await readFile(new URL(`./document-infra/compiled/${name}.json`, import.meta.url), 'utf8');
  return { template: JSON.parse(text), sha256: createHash('sha256').update(text).digest('hex') };
};
const grants = Array.from({ length: 6 }, (_, index) => `${index + 1}a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d`);
const value = parameters => Object.fromEntries(Object.entries(parameters).map(([key, item]) => [key, { value: item }]));
const hostParameters = (extra = {}) => value({ serviceName: service, location: 'northeurope', runId: 'fedcba987654',
  publisherPrincipalId: '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a', roleAssignmentNames: grants, ...extra });
const appParameters = (extra = {}) => value({ serviceName: service, location: 'northeurope', runId: 'fedcba987654',
  imageReference: `${service}images.azurecr.io/document-worker@sha256:${'b'.repeat(64)}`,
  applicationSettings: [{ name: 'DB_AUTH_MODE', value: 'entra' }, { name: 'DB_NAME', value: 'documents' }], ...extra });
const validate = (template, parameters, resourceExists) => validateDeployment({ subscriptionId, resourceGroupName: group,
  deploymentName: 'worker-validation', body: { properties: { mode: 'Incremental', template, parameters } }, resourceExists });
const notImplemented = result => {
  assert.equal(result.status, 501, JSON.stringify(result.body));
  assert.equal(result.body.error.code, 'GlobalStackValidationNotImplemented');
};

test('captured worker templates are the ones Azure validated in the paired run', async () => {
  const summary = JSON.parse(await readFile(new URL('./evidence/document-worker-postgres-paired-20261110/summary.json', import.meta.url)));
  assert.deepEqual(summary.controlPlane.hostValidationHttp, { azure: 200, globalstack: 501 });
  assert.deepEqual(summary.controlPlane.appValidationHttp, { azure: 200, globalstack: 501 });
  assert.equal((await load('worker-host')).sha256, summary.templateSha256.host);
  assert.equal((await load('worker-app')).sha256, summary.templateSha256.app);
});

test('worker host and app validation succeed without creating resources or history', async () => {
  const host = await load('worker-host');
  const app = await load('worker-app');
  const store = new ResourceStore();
  store.putResourceGroup(subscriptionId, group, { location: 'northeurope' });
  let callbacks = 0;
  const server = createArmServer({ store, onResourcePut: () => callbacks++, onResourceDelete: () => callbacks++ });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/subscriptions/${subscriptionId}/resourceGroups/${group}`;
  const send = (method, path, body) => fetch(`${base}${path}`, { method,
    headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const validatePath = name => `/providers/Microsoft.Resources/deployments/${name}/validate?api-version=2025-04-01`;
  try {
    const hosted = await send('POST', validatePath('worker-host'), { properties: { mode: 'Incremental', template: host.template, parameters: hostParameters() } });
    const hostBody = await hosted.json();
    assert.equal(hosted.status, 200, JSON.stringify(hostBody));
    assert.equal(hostBody.properties.provisioningState, 'Succeeded');
    const ids = hostBody.properties.validatedResources.map(item => item.id);
    assert.equal(ids.length, 10);
    // Four copy-loop grants on host storage, then the two registry grants.
    assert.deepEqual(ids.filter(id => id.includes('/storageAccounts/') && id.includes('/roleAssignments/')).map(id => id.split('/').at(-1)), grants.slice(0, 4));
    assert.deepEqual(ids.filter(id => id.includes('/registries/') && id.includes('/roleAssignments/')).map(id => id.split('/').at(-1)), grants.slice(4));

    // The app references a plan and identity deployed by the host template.
    // Their absence is an uncaptured Azure case, so it stays an explicit gap.
    const appBody = { properties: { mode: 'Incremental', template: app.template, parameters: appParameters() } };
    const early = await send('POST', validatePath('worker-app'), appBody);
    assert.equal(early.status, 501);
    assert.equal((await early.json()).error.code, 'GlobalStackValidationNotImplemented');
    assert.equal(store.getDeployment({ subscriptionId, resourceGroupName: group, deploymentName: 'worker-host' }), null);
    assert.equal(callbacks, 0);

    const plan = await send('PUT', `/providers/Microsoft.Web/serverfarms/${service}-worker?api-version=2024-11-01`,
      { location: 'northeurope', kind: 'elastic', sku: { name: 'EP1', tier: 'ElasticPremium', capacity: 1 },
        properties: { reserved: true, maximumElasticWorkerCount: 1 } });
    assert.ok([200, 201].includes(plan.status), await plan.text());
    const planOnly = await send('POST', validatePath('worker-app'), appBody);
    assert.equal(planOnly.status, 501);
    await planOnly.arrayBuffer();
    const identity = await send('PUT', `/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${service}-worker?api-version=2023-01-31`,
      { location: 'northeurope' });
    assert.ok([200, 201].includes(identity.status), await identity.text());
    const before = callbacks;
    const accepted = await send('POST', validatePath('worker-app'), appBody);
    const acceptedBody = await accepted.json();
    assert.equal(accepted.status, 200, JSON.stringify(acceptedBody));
    assert.deepEqual(acceptedBody.properties.validatedResources.map(item => item.id.split('/providers/')[1]), [`Microsoft.Web/sites/${service}-worker`]);
    assert.equal(callbacks, before);
    assert.equal(store.getDeployment({ subscriptionId, resourceGroupName: group, deploymentName: 'worker-app' }), null);
    assert.equal(store.getResource({ subscriptionId, resourceGroupName: group, providerNamespace: 'Microsoft.Web', typePath: `sites/${service}-worker` }), null);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('worker host variants outside the captured shape do not report success', async () => {
  const { template } = await load('worker-host');
  assert.equal(validate(template, hostParameters()).status, 200);
  for (const change of [
    t => { t.resources[1].properties.allowSharedKeyAccess = true; },
    t => { t.resources[1].sku.name = 'Standard_GRS'; },
    t => { t.resources[2].properties.adminUserEnabled = true; },
    t => { t.resources[0].properties = { isolationScope: 'Regional' }; },
    t => { t.resources[4].properties.principalType = 'User'; },
    t => { t.resources[4].copy.mode = 'serial'; t.resources[4].copy.batchSize = 1; },
    t => { t.resources[4].properties.description = "[format('{0}', reference(resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', format('{0}-worker', parameters('serviceName'))), '2023-01-31').principalId)]"; },
    t => { t.resources[4].scope = "[resourceId('Microsoft.Storage/storageAccounts', 'notinthistemplate')]"; },
    t => { t.resources[5].properties.roleDefinitionId = '/providers/Microsoft.Authorization/roleDefinitions/7f951dda-4ed3-4680-a7ca-43fe172d538d'; },
    t => { t.resources[0].condition = true; },
  ]) {
    const variant = structuredClone(template);
    change(variant);
    notImplemented(validate(variant, hostParameters()));
  }
  notImplemented(validate(template, hostParameters({ roleAssignmentNames: grants.map((name, index) => index === 2 ? 'not-a-guid' : name) })));
  notImplemented(validate(template, hostParameters({ publisherPrincipalId: 'publisher' })));
  notImplemented(validate(template, hostParameters({ serviceName: 'Invalid_Name' })));
  const escaped = structuredClone(template);
  escaped.resources[4].properties.principalId = '[[reference(literal).principalId]';
  notImplemented(validate(escaped, hostParameters()));
  for (const roleAssignmentNames of [grants.slice(0, 3), Array(6).fill(grants[0])]) {
    const rejected = validate(template, hostParameters({ roleAssignmentNames }));
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.code, 'InvalidTemplate');
  }
  const missing = validate(template, value({ serviceName: service, location: 'northeurope', runId: 'fedcba987654', roleAssignmentNames: grants }));
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'InvalidTemplate');
  const unnamed = structuredClone(template);
  delete unnamed.resources[4].copy.name;
  assert.equal(validate(unnamed, hostParameters()).status, 400);
});

test('worker app variants outside the captured shape do not report success', async () => {
  const { template } = await load('worker-app');
  const prefix = `/subscriptions/${subscriptionId}/resourcegroups/${group}/providers/`;
  const existing = [`microsoft.web/serverfarms/${service}-worker`, `microsoft.managedidentity/userassignedidentities/${service}-worker`];
  const planExists = id => existing.some(suffix => id.toLowerCase() === prefix + suffix);
  assert.equal(validate(template, appParameters(), planExists).status, 200);
  assert.equal(validate(template, appParameters({ applicationSettings: [] }), planExists).status, 200);
  for (const change of [
    t => { t.resources[0].properties.httpsOnly = false; },
    t => { t.resources[0].kind = 'functionapp,linux'; },
    t => { t.resources[0].identity.type = 'SystemAssigned, UserAssigned'; },
    t => { t.resources[0].properties.siteConfig.ftpsState = 'AllAllowed'; },
    t => { t.resources[0].properties.siteConfig.publicNetworkAccess = 'Enabled'; },
    t => { t.resources[0].properties.siteConfig.linuxFxVersion = 'NODE|20'; },
    t => { t.resources[0].properties.siteConfig.acrUserManagedIdentityID = '[[reference(literal).clientId]'; },
    t => { t.outputs.hostname.value = "[length(reference(resourceId('Microsoft.Web/sites', format('{0}-worker', parameters('serviceName'))), '2024-11-01').defaultHostName)]"; },
    t => { t.outputs.hostname.value = "[concat('https://', reference(resourceId('Microsoft.Web/sites', format('{0}-worker', parameters('serviceName'))), '2024-11-01').defaultHostName)]"; },
  ]) {
    const variant = structuredClone(template);
    change(variant);
    notImplemented(validate(variant, appParameters(), planExists));
  }
  notImplemented(validate(template, appParameters({ applicationSettings: [{ name: 'COUNT', value: 3 }] }), planExists));
  notImplemented(validate(template, appParameters({ applicationSettings: [{ name: 'A', value: 'b', slotSetting: true }] }), planExists));
  notImplemented(validate(template, appParameters(), () => false));
  notImplemented(validate(template, appParameters(), id => id.toLowerCase() === prefix + existing[0]));
  const mixed = validate(template, appParameters({ applicationSettings: 'not-an-array' }), planExists);
  assert.equal(mixed.status, 400);
  assert.equal(mixed.body.error.code, 'InvalidTemplate');
});
