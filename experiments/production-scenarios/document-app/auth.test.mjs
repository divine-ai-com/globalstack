import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { tokenVerifier } from './auth.mjs';

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
