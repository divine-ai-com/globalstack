import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import pg from 'pg';
import { createStorageDataPlaneRouter } from '../../../packages/azure-data-plane/src/storage-router.mjs';
import { tokenVerifier } from './auth.mjs';
import { documentServer, fuzzyQuery } from './ingress.mjs';
import { migrate } from './repository.mjs';

const exec = promisify(execFile);
const tenant = '11111111-1111-4111-8111-111111111111', audience = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333', owner = '44444444-4444-4444-8444-444444444444';
const reader = '55555555-5555-4555-8555-555555555555', group = '66666666-6666-4666-8666-666666666666';
async function identity() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'http-test', alg: 'RS256' }] });
  const verify = tokenVerifier({ tenant, audience, clients: [client] }, keys);
  const sign = async (changes = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return `Bearer ${await new SignJWT({ iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: audience,
      tid: tenant, oid: owner, azp: client, ver: '2.0', exp: now + 600, nbf: now - 10, iat: now - 10,
      roles: ['Documents.Read', 'Documents.Upload', 'Documents.Delete'], scp: 'Documents.Access', groups: [group], ...changes })
      .setProtectedHeader({ alg: 'RS256', kid: 'http-test' }).sign(privateKey)}`;
  };
  return { verify, sign };
}
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('HTTP API rejects unauthenticated callers before accessing any backend', async t => {
  const { verify, sign } = await identity(); let calls = 0;
  const endpoint = await listen(t, documentServer({ verify, log() {}, getClients: async () => { calls++; throw new Error('backend must not be called'); } }));
  assert.equal((await fetch(`${endpoint}/search?q=report`)).status, 401);
  assert.equal((await fetch(`${endpoint}/search?q=report`, { headers: { 'x-ms-client-principal': 'forged', authorization: 'Bearer a.b.c' } })).status, 401);
  assert.equal((await fetch(`${endpoint}/search?q=report`, { headers: { authorization: await sign({ roles: [] }) } })).status, 403);
  assert.equal((await fetch(`${endpoint}/search?q=`, { headers: { authorization: await sign() } })).status, 400);
  assert.equal(calls, 0);
  assert.equal(fuzzyQuery('quarter revenue'), 'quarter~1 AND revenue~1');
  assert.throws(() => fuzzyQuery('*:*'), { status: 400 });
});

test('authenticated ingress uses actual Blob SDK and PostgreSQL for upload, replay, ownership and conditional deletion', { timeout: 60000 }, async t => {
  const id = randomBytes(5).toString('hex'), name = `gs-document-ingress-${id}`;
  const password = randomBytes(24).toString('hex'); let pool;
  t.after(async () => { await pool?.end(); await exec('docker', ['rm', '-f', name]); });
  await exec('docker', ['run', '-d', '--rm', '--name', name, '--label', 'globalstack.experiment=document-ingress',
    '--memory', '512m', '--cpus', '2', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=documents', 'postgres:16-alpine'],
  { env: { ...process.env, POSTGRES_PASSWORD: password } });
  const container = JSON.parse((await exec('docker', ['inspect', name])).stdout)[0];
  pool = new pg.Pool({ host: '127.0.0.1', port: Number(container.NetworkSettings.Ports['5432/tcp'][0].HostPort), user: 'pilot', database: 'documents', password });
  for (let attempt = 0; ; attempt++) {
    try { await pool.query('SELECT 1'); break; } catch (error) { if (attempt >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  await migrate(pool);
  const account = `gs${id}`, key = randomBytes(64).toString('base64'), storage = createStorageDataPlaneRouter();
  storage.registerStorageAccount({ accountName: account, accountKey: key });
  storage.registerContainer({ accountName: account, containerName: 'landing' });
  const handler = storage.blobHandler();
  // The fixture supplies virtual-host routing externally to the unchanged SDK.
  const storageEndpoint = await listen(t, createServer((req, res) => { req.headers.host = `${account}.blob.core.windows.net`; return handler(req, res); }));
  const blobs = new BlobServiceClient(storageEndpoint, new StorageSharedKeyCredential(account, key));
  const { verify, sign } = await identity(), logs = [];
  const endpoint = await listen(t, documentServer({ verify, log: event => logs.push(event), getClients: async () => ({ pool, blobs,
    config: { storageEndpoint, landingContainer: 'landing' } }) }));
  const token = await sign(), uploadKey = '77777777-7777-4777-8777-777777777777';
  const headers = { authorization: token, 'content-type': 'text/plain', 'x-document-name': 'report.txt', 'idempotency-key': uploadKey, 'x-read-groups': group };
  const upload = await fetch(`${endpoint}/documents`, { method: 'POST', headers, body: 'Quarterly revenue 123.45' });
  const uploaded = await upload.json(); assert.equal(upload.status, 202, JSON.stringify(uploaded));
  const blob = blobs.getContainerClient('landing').getBlobClient(`${tenant}/${owner}/${uploadKey}/report.txt`);
  assert.equal((await blob.downloadToBuffer()).toString(), 'Quarterly revenue 123.45');
  const repeated = await fetch(`${endpoint}/documents`, { method: 'POST', headers, body: 'Quarterly revenue 123.45' });
  assert.equal(repeated.status, 202);
  assert.equal((await repeated.json()).etag, uploaded.etag);
  assert.equal((await pool.query('SELECT * FROM document_access')).rowCount, 1);
  assert.equal(new URL((await pool.query('SELECT blob_url FROM document_access')).rows[0].blob_url).port, '');
  const different = await fetch(`${endpoint}/documents`, { method: 'POST', headers, body: 'Changed content' });
  assert.equal(different.status, 409);
  const path = `${endpoint}/documents/${uploaded.documentId}`;
  const groupToken = await sign({ oid: reader });
  assert.equal((await fetch(path, { headers: { authorization: groupToken } })).status, 200);
  assert.equal((await fetch(path, { headers: { authorization: await sign({ oid: reader, groups: [] }) } })).status, 404);
  assert.equal((await fetch(path, { method: 'DELETE', headers: { authorization: groupToken, 'if-match': uploaded.etag } })).status, 404);
  assert.equal((await fetch(path, { method: 'DELETE', headers: { authorization: token } })).status, 428);
  assert.equal((await fetch(path, { method: 'DELETE', headers: { authorization: token, 'if-match': '"stale"' } })).status, 412);
  const updated = await fetch(path, { method: 'PUT', headers: { authorization: token, 'if-match': uploaded.etag, 'content-type': 'text/plain' }, body: 'Updated revenue 234.56' });
  const changed = await updated.json(); assert.equal(updated.status, 202, JSON.stringify(changed));
  assert.notEqual(changed.etag, uploaded.etag);
  assert.equal(changed.correlationId, uploadKey);
  assert.equal((await blob.downloadToBuffer()).toString(), 'Updated revenue 234.56');
  assert.equal((await fetch(path, { method: 'DELETE', headers: { authorization: token, 'if-match': changed.etag } })).status, 202);
  assert.equal(await blob.exists(), false);
  assert.ok(logs.some(event => event.stage === 'upload_accepted' && event.correlationId === uploadKey));
  assert.equal(JSON.stringify(logs).includes(token), false);
});
