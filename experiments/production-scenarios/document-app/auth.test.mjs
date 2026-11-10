import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { configuredTokenVerifier, tokenVerifier } from './auth.mjs';

test('configured signing-key endpoint stays on the tenant-specific Microsoft origin', () => {
  const before = { tenant: process.env.ENTRA_TENANT_ID, audience: process.env.API_AUDIENCE,
    clients: process.env.API_ALLOWED_CLIENTS, uri: process.env.ENTRA_JWKS_URI };
  const tenant = '11111111-1111-4111-8111-111111111111';
  try {
    process.env.ENTRA_TENANT_ID = tenant;
    process.env.API_AUDIENCE = '22222222-2222-4222-8222-222222222222';
    process.env.API_ALLOWED_CLIENTS = '33333333-3333-4333-8333-333333333333';
    process.env.ENTRA_JWKS_URI = `https://login.microsoftonline.com:8443/${tenant}/discovery/v2.0/keys`;
    assert.equal(typeof configuredTokenVerifier(), 'function');
    for (const uri of ['https://attacker.invalid/' + tenant + '/discovery/v2.0/keys',
      `http://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      `https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222/discovery/v2.0/keys`,
      `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys?redirect=1`]) {
      process.env.ENTRA_JWKS_URI = uri;
      assert.throws(() => configuredTokenVerifier());
    }
  } finally {
    for (const [key, value] of [['ENTRA_TENANT_ID', before.tenant], ['API_AUDIENCE', before.audience],
      ['API_ALLOWED_CLIENTS', before.clients], ['ENTRA_JWKS_URI', before.uri]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('API authorization verifies signed tenant, audience, actor, expiry, role and scope', async () => {
  const tenant = '11111111-1111-4111-8111-111111111111', audience = '22222222-2222-4222-8222-222222222222';
  const client = '33333333-3333-4333-8333-333333333333', subject = '44444444-4444-4444-8444-444444444444';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const key = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' };
  const verify = tokenVerifier({ tenant, audience, clients: [client] }, createLocalJWKSet({ keys: [key] }));
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: audience, tid: tenant, oid: subject,
    azp: client, ver: '2.0', exp: now + 600, nbf: now - 10, iat: now - 10, roles: ['Documents.Read'], scp: 'Documents.Access' };
  const sign = async changes => `Bearer ${await new SignJWT({ ...claims, ...changes }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey)}`;
  const principal = await verify(await sign({}), 'Documents.Read');
  assert.equal(principal.tenant, tenant); assert.equal(principal.subject, subject);
  for (const changes of [ { aud: client }, { tid: client }, { iss: 'https://foreign.example' }, { exp: now - 60 }, { nbf: now + 60 }, { ver: '1.0' }, { oid: 'not-an-object-id' } ]) {
    await assert.rejects(verify(await sign(changes), 'Documents.Read'), { status: 401 });
  }
  for (const changes of [{ azp: subject }, { roles: [] }, { scp: 'unrelated' }, { scp: undefined }, { _claim_names: { groups: 'src1' } }, { groups: ['invalid'] }]) {
    await assert.rejects(verify(await sign(changes), 'Documents.Read'), { status: 403 });
  }
  assert.equal((await verify(await sign({ scp: undefined, idtyp: 'app' }), 'Documents.Read')).client, client);
  await assert.rejects(verify(await sign({}), 'Documents.Upload'), { status: 403 });
  for (const header of [undefined, 'Basic credentials', 'Bearer invalid', 'Bearer a.b.c', `Bearer ${'a'.repeat(17000)}.b.c`]) await assert.rejects(verify(header, 'Documents.Read'), { status: 401 });
  const other = await generateKeyPair('RS256');
  const forged = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(other.privateKey);
  await assert.rejects(verify(`Bearer ${forged}`, 'Documents.Read'), { status: 401 });
});
