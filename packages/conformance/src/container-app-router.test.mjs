import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createServer as tlsServer, request } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

test('Container Apps ARM lifecycle gates actual HTTP forwarding on live authentication policy', async t => {
  const sub = '00000000-0000-0000-0000-000000000000';
  const client = '11111111-1111-4111-8111-111111111111';
  const oid = '22222222-2222-4222-8222-222222222222';
  const audience = '33333333-3333-4333-8333-333333333333';
  const issuer = `https://login.microsoftonline.com/${sub}/v2.0`;
  const pair = await generateKeyPair('RS256');
  const key = { ...await exportJWK(pair.publicKey), alg: 'RS256', use: 'sig', kid: 'worker' };
  const servers = []; let calls = 0, starts = 0, stops = 0, receivedHeaders;
  const directory = await mkdtemp(join(tmpdir(), 'gs-ca-tls-'));
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(done => server.close(done)); } await rm(directory, { recursive: true, force: true }); });
  const listen = async server => { servers.push(server); await new Promise(done => server.listen(0, '127.0.0.1', done)); return server.address().port; };
  const upstream = await listen(createServer((req, res) => { calls++; receivedHeaders = req.headers; res.end('actual worker response'); }));
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store, containerAppTokenTrusts: [{ issuer, tenantId: sub, subscriptionIds: [sub], jwks: { keys: [key] } }],
    nativeContainerAppProvisioner: async () => { starts++; return { origin: `http://127.0.0.1:${upstream}`, dispose: async () => { stops++; } }; } });
  t.after(() => runtime.dispose());
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource }));
  const group = `/subscriptions/${sub}/resourceGroups/scanner`;
  async function put(id, body, method = 'PUT') {
    const response = await fetch(`http://127.0.0.1:${arm}${id}?api-version=2025-01-01`, { method,
      headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    assert.ok([200, 201, 202, 204].includes(response.status), `${method} ${id} ${response.status}`);
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  await put(group, { location: 'westus2' });
  const env = `${group}/providers/Microsoft.App/managedEnvironments/env`;
  await put(env, { location: 'westus2', properties: {} });
  const id = `${group}/providers/Microsoft.App/containerApps/scanner`;
  const body = { location: 'westus2', properties: { managedEnvironmentId: env,
    configuration: { activeRevisionsMode: 'Single', ingress: { external: true, targetPort: 8080, transport: 'http' } },
    template: { containers: [{ name: 'scanner', image: 'approved-image' }], scale: { minReplicas: 1, maxReplicas: 1 } } } };
  const app = await put(id, body); await runtime.containerAppRouter.lifecycle.settle();
  assert.equal(runtime.containerAppRouter.lifecycle.status(id), 'running');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', `subjectAltName=IP:127.0.0.1,DNS:${app.properties.configuration.ingress.fqdn}`, '-keyout', join(directory, 'key'), '-out', join(directory, 'cert')], { stdio: 'ignore' });
  const ca = await readFile(join(directory, 'cert'));
  const port = await listen(tlsServer({ key: await readFile(join(directory, 'key')), cert: ca }, runtime.containerAppRouter.handler()));
  async function send(token, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = request(`https://127.0.0.1:${port}/scan`, { ca, method: 'POST', headers: {
        host: app.properties.configuration.ingress.fqdn, ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      }); req.on('error', reject); req.end('input');
    });
  }
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ iss: issuer, aud: audience, tid: sub, oid, azp: client, idtyp: 'app', iat: now, nbf: now, exp: now + 600 })
    .setProtectedHeader({ alg: 'RS256', kid: 'worker' }).sign(pair.privateKey);
  assert.equal((await send(token)).status, 501); assert.equal(calls, 0);
  const config = { properties: { platform: { enabled: true }, httpSettings: { requireHttps: true },
    globalValidation: { unauthenticatedClientAction: 'Return401' }, identityProviders: { azureActiveDirectory: { enabled: true,
      registration: { clientId: audience, openIdIssuer: issuer }, validation: { allowedAudiences: [audience],
        defaultAuthorizationPolicy: { allowedApplications: [client], allowedPrincipals: { identities: [oid] } },
        jwtClaimChecks: { allowedClientApplications: [client] } } } } } };
  await put(`${id}/authConfigs/current`, config);
  assert.equal((await send()).status, 401); assert.equal(calls, 0);
  assert.deepEqual(await send(token, { 'x-ms-client-principal': 'forged-platform-header' }), { status: 200, body: 'actual worker response' });
  assert.equal(receivedHeaders['x-ms-client-principal'], undefined);
  assert.equal(calls, 1);
  config.properties.identityProviders.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedApplications = [oid];
  await put(`${id}/authConfigs/current`, config);
  assert.equal((await send(token)).status, 403); assert.equal(calls, 1);
  await put(id, { ...body, tags: { changed: 'true' } }); await runtime.containerAppRouter.lifecycle.settle();
  assert.equal(starts, 1);
  body.properties.template.containers[0].image = 'second-approved-image';
  await put(id, body); await runtime.containerAppRouter.lifecycle.settle();
  assert.equal(starts, 2); assert.equal(stops, 1);
  await put(id, undefined, 'DELETE'); await runtime.containerAppRouter.lifecycle.settle();
  assert.equal((await send(token)).status, 404); assert.equal(stops, 2);
});
