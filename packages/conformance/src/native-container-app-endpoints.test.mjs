import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveNativeContainerAppEndpoints } from '../../azure-data-plane/src/native-container-app-endpoints.mjs';

const subscription = '11111111-1111-4111-8111-111111111111';
const resource = { id: `/subscriptions/${subscription}/resourceGroups/worker/providers/Microsoft.Web/sites/worker` };
const app = { id: `/subscriptions/${subscription}/resourceGroups/services/providers/Microsoft.App/containerApps/scanner`,
  type: 'Microsoft.App/containerApps', properties: { configuration: { ingress: { fqdn: 'scanner.example.azurecontainerapps.io' } } } };
const fixture = () => ({ resource, store: { resources: new Map([[app.id, structuredClone(app)]]) },
  settings: { DOCUMENT_SCANNER_URL: 'https://scanner.example.azurecontainerapps.io' }, names: ['DOCUMENT_SCANNER_URL'] });

test('native endpoint transport resolves explicit settings to a deployed app without changing application code', () => {
  assert.deepEqual(resolveNativeContainerAppEndpoints(fixture()), [{ setting: 'DOCUMENT_SCANNER_URL',
    hostname: 'scanner.example.azurecontainerapps.io', resourceId: app.id }]);
  assert.deepEqual(resolveNativeContainerAppEndpoints({ resource, settings: {} }), []);
});

test('native endpoint transport rejects foreign, ambiguous, unknown and credential-bearing targets', () => {
  for (const url of ['http://scanner.example.azurecontainerapps.io', 'https://unknown.example',
    'https://user:password@scanner.example.azurecontainerapps.io', 'https://scanner.example.azurecontainerapps.io?token=synthetic',
    'https://scanner.example.azurecontainerapps.io/path', 'https://scanner.example.azurecontainerapps.io:1234', 'https://127.0.0.1']) {
    const input = fixture(); input.settings.DOCUMENT_SCANNER_URL = url;
    assert.throws(() => resolveNativeContainerAppEndpoints(input));
  }
  const foreign = fixture(); foreign.store.resources.get(app.id).id = app.id.replace(subscription, '22222222-2222-4222-8222-222222222222');
  assert.throws(() => resolveNativeContainerAppEndpoints(foreign));
  const duplicate = fixture(); duplicate.store.resources.set('duplicate', structuredClone(app));
  assert.throws(() => resolveNativeContainerAppEndpoints(duplicate));
  const repeated = fixture(); repeated.names.push(repeated.names[0]);
  assert.throws(() => resolveNativeContainerAppEndpoints(repeated));
});
