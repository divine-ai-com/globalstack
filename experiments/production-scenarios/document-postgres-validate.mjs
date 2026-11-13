import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';
import { validationPollPath } from './polling.mjs';

const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit the source before capture');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const source = await readFile(new URL('./document-infra/document-postgres.bicep', import.meta.url));
const compiled = await readFile(new URL('./document-infra/compiled/document-postgres.json', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
assert.equal(hash(source), '8168db6da3382f9e442b9bf282d8972117423cead3da59d429ea18329f710280');
assert.equal(hash(compiled), '47281bbb75f6f4e6c91534971535928ee1dc05ffd2418ae830744f17501444a9');
const template = JSON.parse(compiled);
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const account = azureCli(config, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const groupName = 'gs-conformance-pilot';
assert.deepEqual(azureCli(config, ['resource', 'list', '--resource-group', groupName]), [], 'Pilot group must be empty before validation');
const token = azureToken(config);
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
assert.equal(claims.tid, account.tenantId);
assert.match(claims.oid, /^[a-f0-9-]{36}$/i);
const runId = randomBytes(6).toString('hex');
const serviceName = `gs${runId}`;
const group = `/subscriptions/${account.id}/resourceGroups/${groupName}`;
const deployment = `${group}/providers/Microsoft.Resources/deployments/gs-document-postgres-${runId}`;
const body = { properties: { mode: 'Incremental', validationLevel: 'Provider', template,
  parameters: Object.fromEntries(Object.entries({ serviceName, location: 'westus2', runId, tenantId: account.tenantId,
    administratorObjectId: claims.oid, administratorName: 'globalstack-conformance-pilot' }).map(([key, value]) => [key, { value }])) } };
const replacements = [[token, '<redacted>'], [account.id, '<subscription>'], [account.tenantId, '<tenant>'],
  [claims.oid, '<pilot-principal>'], [groupName, '<group>'], [serviceName, '<service>'], [runId, '<run>']];
const report = { schemaVersion: 1, revision, sourceDirty: false, templateSha256: hash(compiled),
  scope: 'Provider-level validation of an Entra-only PostgreSQL document template. No resource deployment or data-plane test.',
  startedAt: new Date().toISOString(), targets: {}, noResourcesCreated: false };
process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = account.id;
const arm = createArmServer({ store: new ResourceStore() });
await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
const localOrigin = `http://127.0.0.1:${arm.address().port}`;
const exchange = (target, method, path, payload) => httpExchange(`${target === 'azure' ? 'https://management.azure.com' : localOrigin}${path}`, {
  method, body: payload, timeoutMs: 60000, headers: { authorization: `Bearer ${target === 'azure' ? token : 'globalstack-local-token'}` },
});
try {
  assert.equal((await exchange('local', 'PUT', `${group}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  for (const target of ['azure', 'local']) {
    const path = `${deployment}/validate?api-version=2025-04-01`;
    let response = await exchange(target, 'POST', path, body);
    const observations = [sanitize(response, replacements)];
    const deadline = Date.now() + 120000;
    while (response.status === 202 && Date.now() < deadline) {
      const poll = validationPollPath(response.headers.location ?? response.headers['azure-asyncoperation'], account.id);
      if (!poll) break;
      await new Promise(done => setTimeout(done, 2000));
      response = await exchange(target, 'GET', poll);
      observations.push(sanitize(response, replacements));
    }
    report.targets[target] = { observations, terminal: response.status !== 202 };
  }
  const inventory = azureCli(config, ['resource', 'list', '--resource-group', groupName]);
  let record = await exchange('azure', 'GET', `${deployment}?api-version=2025-04-01`);
  if (record.status === 200) {
    assert.equal(record.body?.properties?.parameters?.runId?.value, runId, 'Validation record ownership mismatch');
    assert.ok([200, 202, 204].includes((await exchange('azure', 'DELETE', `${deployment}?api-version=2025-04-01`)).status));
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      record = await exchange('azure', 'GET', `${deployment}?api-version=2025-04-01`);
      if (record.status === 404) break;
      await new Promise(done => setTimeout(done, 2000));
    }
  }
  report.noResourcesCreated = inventory.length === 0 && record.status === 404;
  report.azureResourceCountAfter = inventory.length;
  report.deploymentRecordStatus = record.status;
} catch (error) {
  report.error = sanitize(error.message, replacements);
} finally {
  await exchange('local', 'DELETE', `${group}?api-version=2022-09-01`).catch(() => {});
  arm.closeAllConnections();
  await new Promise(resolve => arm.close(resolve));
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(`PostgreSQL validation evidence: ${out}`);
process.exitCode = report.error || !report.noResourcesCreated || !Object.values(report.targets).every(item => item.terminal) ? 1 : 0;
