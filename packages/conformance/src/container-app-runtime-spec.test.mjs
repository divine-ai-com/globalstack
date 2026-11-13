import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containerAppRuntimeSpec } from '../../azure-data-plane/src/docker-container-app-provisioner.mjs';

const image = `sha256:${'a'.repeat(64)}`;
const catalog = new Map([['approved', image]]);
const fixture = () => ({ properties: {
  configuration: { activeRevisionsMode: 'Single', ingress: { targetPort: 8080 } },
  template: { scale: { minReplicas: 1, maxReplicas: 1 }, containers: [{ name: 'worker', image: 'approved',
    resources: { cpu: 2, memory: '4Gi' }, env: [{ name: 'PORT', value: '8080' }],
    probes: [{ type: 'Readiness', httpGet: { path: '/health', port: 8080 } }] }] },
} });
test('Container Apps execution honors resource bounds and rejects unsupported deployment semantics', () => {
  const spec = containerAppRuntimeSpec(fixture(), catalog);
  assert.equal(spec.image, image); assert.equal(spec.memory, '4096m'); assert.equal(spec.env.PORT, '8080');
  for (const change of [
    r => { r.properties.template.containers[0].image = 'unapproved'; },
    r => { r.properties.template.containers[0].resources.memory = '16Gi'; },
    r => { r.properties.template.containers[0].resources.cpu = 8; },
    r => { r.properties.template.containers[0].env = [{ name: 'TOKEN', secretRef: 'secret' }]; },
    r => { r.properties.template.containers[0].env.push({ name: 'PORT', value: '9999' }); },
    r => { r.properties.template.containers[0].command = ['sh']; },
    r => { r.properties.template.containers[0].probes[0].httpGet.path = 'https://public.example/'; },
    r => { r.properties.template.containers[0].probes[0].httpGet.port = 9999; },
    r => { r.properties.template.scale.maxReplicas = 2; },
    r => { r.properties.template.volumes = [{ name: 'host' }]; },
    r => { r.properties.configuration.activeRevisionsMode = 'Multiple'; },
  ]) {
    const resource = fixture(); change(resource); assert.throws(() => containerAppRuntimeSpec(resource, catalog));
  }
});
