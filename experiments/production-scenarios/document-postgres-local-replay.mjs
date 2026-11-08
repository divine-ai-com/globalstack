import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureToken } from './azure-session.mjs';
import { postgresScope } from './document-postgres-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';

assert.ok(process.env.PAIRED_SOURCE_MANIFEST && process.env.PAIRED_RUN_DIR);
const manifest = JSON.parse(await readFile(process.env.PAIRED_SOURCE_MANIFEST, 'utf8'));
const scope = postgresScope(manifest);
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3);
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before replay');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const originalBytes = await readFile(new URL('./evidence/document-postgres-paired-efb90ad/result.json', import.meta.url));
const original = JSON.parse(originalBytes);
assert.equal(original.azureTerminalState, 'Succeeded');
const compiled = await readFile(new URL('./document-infra/compiled/document-postgres.json', import.meta.url));
assert.equal(createHash('sha256').update(compiled).digest('hex'), original.templateSha256);
const token = azureToken(manifest.config);
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
assert.match(claims.tid ?? '', /^[a-f0-9-]{36}$/i);
assert.match(claims.oid ?? '', /^[a-f0-9-]{36}$/i);
const body = { properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters: Object.fromEntries(Object.entries({
  serviceName: `gs${manifest.runId}`, location: 'westus2', runId: manifest.runId, tenantId: claims.tid,
  administratorObjectId: claims.oid, administratorName: 'globalstack-conformance-pilot',
}).map(([key, value]) => [key, { value }])) } };
const replacements = [[token, '<redacted>'], [manifest.subscription, '<subscription>'], [claims.tid, '<tenant>'],
  [claims.oid, '<pilot-principal>'], [manifest.group, '<group>'], [manifest.runId, '<run>']];
const originalPut = original.observations.find(item => item.target === 'azure' && item.phase === 'deploy-azure' && item.method === 'PUT');
assert.ok(originalPut, 'Original Azure PUT is missing');
assert.deepEqual(sanitize(body, replacements), originalPut.request, 'Local replay differs from the original Azure deployment request');
process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = manifest.subscription;
const arm = createArmServer({ store: new ResourceStore() });
await new Promise(done => arm.listen(0, '127.0.0.1', done));
const request = (method, path, payload) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
  method, body: payload, headers: { authorization: 'Bearer globalstack-local-token' },
});
const report = { schemaVersion: 1, revision, originalRevision: original.revision,
  originalResultSha256: createHash('sha256').update(originalBytes).digest('hex'), templateSha256: original.templateSha256,
  sameSanitizedDeploymentRequest: true, scope: 'Local ARM replay of the original Azure PostgreSQL deployment request. No SQL data-plane test.',
  startedAt: new Date().toISOString(), resources: {}, cleanup: null };
try {
  const group = await request('PUT', `${scope.group}?api-version=2022-09-01`, { location: 'westus2' });
  assert.ok([200, 201].includes(group.status));
  const deployed = await request('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
  report.deployment = sanitize({ status: deployed.status, state: deployed.body?.properties?.provisioningState,
    error: deployed.body?.error }, replacements);
  for (const [name, id] of Object.entries({ server: scope.server,
    administrator: `${scope.server}/administrators/${claims.oid}`, database: `${scope.server}/databases/documents` })) {
    report.resources[name] = (await request('GET', `${id}?api-version=2024-08-01`)).status;
  }
} catch (error) {
  report.error = sanitize(error.message, replacements);
} finally {
  const deleted = await request('DELETE', `${scope.group}?api-version=2022-09-01`);
  report.cleanup = { deleteStatus: deleted.status,
    groupAbsent: (await request('GET', `${scope.group}?api-version=2022-09-01`)).status === 404 };
  arm.closeAllConnections();
  await new Promise(done => arm.close(done));
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, deployment: report.deployment, resources: report.resources, cleanup: report.cleanup, error: report.error ?? null }));
if (report.error || report.deployment?.state !== 'Succeeded' || !Object.values(report.resources).every(status => status === 200)
  || !report.cleanup?.groupAbsent) process.exitCode = 1;
