import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateDeployment } from '../../packages/azure-control-plane/src/deployment-validation.mjs';

test('captured Azure PostgreSQL validation accepts the Entra-only document shape locally', async () => {
  const capture = JSON.parse(await readFile(new URL('./evidence/document-postgres-validation-3ee3c25/result.json', import.meta.url)));
  assert.equal(capture.targets.azure.observations[0].status, 200);
  assert.equal(capture.targets.local.observations[0].status, 501);
  assert.equal(capture.noResourcesCreated, true);
  assert.equal(capture.azureResourceCountAfter, 0);
  assert.equal(capture.deploymentRecordStatus, 404);
  const followup = JSON.parse(await readFile(new URL('./evidence/document-postgres-validation-38e1f19/result.json', import.meta.url)));
  assert.deepEqual(['azure', 'local'].map(target => followup.targets[target].observations[0].status), [200, 200]);
  assert.equal(followup.noResourcesCreated, true);
  assert.equal(followup.azureResourceCountAfter, 0);
  assert.equal(followup.deploymentRecordStatus, 404);
  const template = JSON.parse(await readFile(new URL('./document-infra/compiled/document-postgres.json', import.meta.url)));
  const subscriptionId = '00000000-0000-0000-0000-000000000000';
  const parameters = { serviceName: 'gs123456789abc', location: 'westus2', runId: '123456789abc',
    tenantId: '11111111-1111-4111-8111-111111111111', administratorObjectId: '22222222-2222-4222-8222-222222222222',
    administratorName: 'pilot-service-principal' };
  const request = t => validateDeployment({ subscriptionId, resourceGroupName: 'gs-conformance-pilot',
    deploymentName: 'gs-document-postgres-test', body: { properties: { mode: 'Incremental', validationLevel: 'Provider',
      template: t, parameters: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { value }])) } } });
  const accepted = request(template);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.properties.validatedResources.length, 3);
  assert.deepEqual(accepted.body.properties.validatedResources.map(item => item.id.split('/providers/')[1].split('/')[0]),
    Array(3).fill('Microsoft.DBforPostgreSQL'));
  for (const change of [
    t => { t.resources[0].properties.authConfig.passwordAuth = 'Enabled'; },
    t => { t.resources[0].sku.name = 'UncapturedSku'; },
    t => { t.resources[1].properties.principalType = 'User'; },
  ]) {
    const variant = structuredClone(template);
    change(variant);
    const rejected = request(variant);
    assert.equal(rejected.status, 501);
    assert.equal(rejected.body.error.code, 'GlobalStackValidationNotImplemented');
  }
});
