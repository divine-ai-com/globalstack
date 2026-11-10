import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createContainerAppAuthorizer } from '../../azure-data-plane/src/container-app-auth.mjs';

const tenant = '11111111-1111-4111-8111-111111111111';
const audience = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333';
const principal = '44444444-4444-4444-8444-444444444444';
const other = '55555555-5555-4555-8555-555555555555';
const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
export function scannerAuth() {
  return { properties: { platform: { enabled: true }, globalValidation: { unauthenticatedClientAction: 'Return401' },
    httpSettings: { requireHttps: true }, identityProviders: { azureActiveDirectory: { enabled: true,
      registration: { clientId: audience, openIdIssuer: issuer }, validation: { allowedAudiences: [audience],
        defaultAuthorizationPolicy: { allowedApplications: [client], allowedPrincipals: { identities: [principal] } },
        jwtClaimChecks: { allowedClientApplications: [client] } } } } } };
}

test('scanner ingress authenticates signatures and requires both deployed caller identifiers', async () => {
  const pair = await generateKeyPair('RS256');
  const key = { ...await exportJWK(pair.publicKey), alg: 'RS256', use: 'sig', kid: 'test' };
  const authorize = createContainerAppAuthorizer({ trusts: [{ issuer, tenantId: tenant, subscriptionIds: [tenant], jwks: { keys: [key] } }] });
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, aud: audience, tid: tenant, oid: principal, azp: client, idtyp: 'app',
    exp: now + 300, nbf: now - 1, iat: now - 1 };
  const sign = async (changes = {}, signingKey = pair.privateKey) => `Bearer ${await new SignJWT({ ...claims, ...changes })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(signingKey)}`;
  const input = { subscription: tenant, secure: true, configuration: scannerAuth() };
  assert.equal(await authorize({ ...input, authorization: await sign() }), null);
  const withAppIdUri = scannerAuth();
  withAppIdUri.properties.identityProviders.azureActiveDirectory.validation.allowedAudiences.push(`api://${audience}`);
  assert.equal(await authorize({ ...input, configuration: withAppIdUri, authorization: await sign() }), null);
  withAppIdUri.properties.identityProviders.azureActiveDirectory.validation.allowedAudiences.push('api://untrusted.example');
  assert.equal((await authorize({ ...input, configuration: withAppIdUri, authorization: await sign() })).status, 501);
  const withoutLegacyCheck = scannerAuth(); delete withoutLegacyCheck.properties.identityProviders.azureActiveDirectory.validation.jwtClaimChecks;
  assert.equal(await authorize({ ...input, configuration: withoutLegacyCheck, authorization: await sign() }), null);
  for (const changes of [{ azp: other }, { oid: other }, { scp: 'Documents.Access' }, { idtyp: 'user' }, { idtyp: undefined }]) {
    assert.equal((await authorize({ ...input, authorization: await sign(changes) })).status, 403);
    assert.equal((await authorize({ ...input, configuration: withoutLegacyCheck, authorization: await sign(changes) })).status, 403);
  }
  for (const changes of [{ aud: other }, { tid: other }, { iss: 'https://untrusted.example/' }, { exp: now - 1 }, { nbf: now + 60 }]) {
    assert.equal((await authorize({ ...input, authorization: await sign(changes) })).status, 401);
  }
  const forged = await generateKeyPair('RS256');
  assert.equal((await authorize({ ...input, authorization: await sign({}, forged.privateKey) })).status, 401);
  assert.equal((await authorize(input)).status, 401);
  assert.equal((await authorize({ ...input, authorization: await sign(), secure: false })).status, 403);
  const changed = scannerAuth();
  changed.properties.identityProviders.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedApplications = [other];
  assert.equal((await authorize({ ...input, configuration: changed, authorization: await sign() })).status, 403);
  for (const configuration of [undefined, { properties: {} }, { properties: { ...scannerAuth().properties, globalValidation: { unauthenticatedClientAction: 'AllowAnonymous' } } }]) {
    assert.equal((await authorize({ ...input, configuration, authorization: await sign() })).status, 501);
  }
});
