import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from './document-app/node_modules/jose/dist/webapi/index.js';
import { azureCli } from './azure-session.mjs';

const tenant = process.env.ENTRA_TENANT_ID;
const audience = process.env.SCANNER_API_AUDIENCE;
const pilot = process.env.PILOT_CLIENT_ID;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
for (const value of [tenant, audience, pilot]) assert.match(value, uuid);
assert.notEqual(audience, pilot);
const output = resolve(process.env.SCANNER_PROBE_DIR ?? 'reports/production-scenarios/scanner-token');
const { accessToken } = azureCli(process.env.AZURE_CONFIG_DIR, [
  'account', 'get-access-token', '--scope', `api://${audience}/.default`,
]);
const keys = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`));
const options = { issuer: `https://login.microsoftonline.com/${tenant}/v2.0`, audience,
  algorithms: ['RS256'], requiredClaims: ['exp', 'nbf', 'iat', 'tid', 'azp', 'oid', 'idtyp', 'ver'] };
const { payload } = await jwtVerify(accessToken, keys, options);
assert.equal(payload.tid, tenant);
assert.equal(payload.azp, pilot);
assert.equal(payload.idtyp, 'app');
assert.equal(payload.ver, '2.0');
assert.match(payload.oid, uuid);
assert.equal(payload.scp, undefined);
assert.deepEqual(payload.roles ?? [], []);
await assert.rejects(jwtVerify(accessToken, keys, { ...options, audience: pilot }), { code: 'ERR_JWT_CLAIM_VALIDATION_FAILED' });
const segments = accessToken.split('.');
const claims = JSON.parse(Buffer.from(segments[1], 'base64url'));
segments[1] = Buffer.from(JSON.stringify({ ...claims, azp: audience })).toString('base64url');
await assert.rejects(jwtVerify(segments.join('.'), keys, options), { code: 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' });
const result = {
  at: new Date().toISOString(),
  scope: 'Live Entra scanner audience token verification only. No scanner endpoint was deployed or called.',
  signatureVerified: true, applicationOnly: true, roleless: true,
  wrongAudienceRejected: true, alteredCallerRejected: true,
  scannerIngressTested: false, workerAccessTested: false,
  requiredNextCheck: 'A real worker token must pass scanner ingress; the valid pilot token must be denied.',
};
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(result));
