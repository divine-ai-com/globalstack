import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { capabilityForResourceType } from '../../core/src/azure-tier1-capabilities.mjs';

test('api management child resources materialize leaf identifiers needed for provider refresh', () => {
  const store = new ResourceStore();
  store.putResourceGroup('00000000-0000-0000-0000-000000000000', 'rg-apim', { location: 'eastus' });

  const productApiRoute = {
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    resourceGroupName: 'rg-apim',
    providerNamespace: 'Microsoft.ApiManagement',
    typePath: 'service/apimsvc/products/partner-product/apis/partner-api',
  };
  store.putResource({
    ...productApiRoute,
    apiVersion: '2022-08-01',
    body: {},
    capability: capabilityForResourceType('Microsoft.ApiManagement/service/products/apis'),
  });

  const productApi = store.getResource(productApiRoute);
  assert.equal(productApi.resourceGroupName, 'rg-apim');
  assert.equal(productApi.serviceName, 'apimsvc');
  assert.equal(productApi.productId, 'partner-product');
  assert.equal(productApi.apiId, 'partner-api');
  assert.equal(productApi.name, 'apimsvc/partner-product/partner-api');
  assert.equal(productApi.type, 'Microsoft.ApiManagement/service/products/apis');

  const policyRoute = {
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    resourceGroupName: 'rg-apim',
    providerNamespace: 'Microsoft.ApiManagement',
    typePath: 'service/apimsvc/apis/partner-api/operations/intake/policies/policy',
  };
  store.putResource({
    ...policyRoute,
    apiVersion: '2022-08-01',
    body: {},
    capability: capabilityForResourceType('Microsoft.ApiManagement/service/apis/operations/policies'),
  });

  const policy = store.getResource(policyRoute);
  assert.equal(policy.resourceGroupName, 'rg-apim');
  assert.equal(policy.serviceName, 'apimsvc');
  assert.equal(policy.apiId, 'partner-api');
  assert.equal(policy.operationId, 'intake');
  assert.equal(policy.policyId, 'policy');
  assert.equal(policy.name, 'apimsvc/partner-api/intake/policy');
  assert.equal(policy.type, 'Microsoft.ApiManagement/service/apis/operations/policies');
});
