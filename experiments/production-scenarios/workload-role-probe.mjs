import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { assertDocumentDelegation } from './operator/delegation-check.mjs';

const subscription = process.env.PAIRED_SUBSCRIPTION_ID, group = process.env.PAIRED_RESOURCE_GROUP;
assert.match(subscription ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
assert.match(group ?? '', /^gs-[a-z0-9-]{1,70}$/);
assert.ok(process.env.PAIRED_RUN_DIR);
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit before recording');
const token = azureToken(process.env.PAIRED_AZURE_CONFIG_DIR);
// Claims identify the caller only. Azure authenticates and authorizes every request.
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
const scope = `/subscriptions/${subscription}/resourceGroups/${group}`;
const assignment = `${scope}/providers/Microsoft.Authorization/roleAssignments/${randomUUID()}`;
const catalog = JSON.parse(await readFile(new URL('./operator/document-role-catalog.json', import.meta.url)));
const roleName = process.env.PAIRED_ROLE_NAME ?? 'Search Index Data Reader';
const roleId = catalog.roles.find(role => role.name === roleName)?.id;
assert.ok(roleId, 'Only a listed pilot role may be probed');
const properties = { roleDefinitionId: `/subscriptions/${subscription}/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
  principalId: claims.oid, principalType: 'ServicePrincipal', description: 'Disposable GlobalStack delegation probe. Remove after read verification.' };
const replacements = [[token, '<redacted>'], [subscription, '<subscription>'], [group, '<group>'], [claims.oid, '<pilot-principal>']];
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  roleName, roleId, scope: 'Temporary listed workload grant to the existing pilot identity in its dedicated group. No paid resources or data access tested.',
  businessWorkflowCompleted: false, exchanges: [], cleanup: false };
const journal = resolve(out, 'private-cleanup.json');
let arm, submitted = false;
async function request(target, method, path, body) {
  const url = new URL(path, 'https://management.azure.com');
  assert.ok(url.origin === 'https://management.azure.com' && !url.hash && !url.username && !url.password);
  assert.ok(url.pathname === assignment && ['GET', 'PUT', 'DELETE'].includes(method)
    || method === 'GET' && [scope, `${scope}/providers/Microsoft.Authorization/roleAssignments`].includes(url.pathname));
  const origin = target === 'azure' ? url.origin : `http://127.0.0.1:${arm.address().port}`;
  const result = await httpExchange(origin + url.pathname + url.search, { method, body,
    headers: { authorization: `Bearer ${target === 'azure' ? token : 'globalstack-local-token'}` } });
  report.exchanges.push(sanitize({ target, method, path, request: body, ...result, at: new Date().toISOString() }, replacements));
  return result;
}
const apiPath = `${assignment}?api-version=2022-04-01`;
try {
  const existing = await request('azure', 'GET', `${scope}?api-version=2022-09-01`);
  assert.equal(existing.status, 200);
  const roles = await request('azure', 'GET', `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01`);
  assert.equal(roles.status, 200); assert.ok(!roles.body.nextLink);
  const delegated = roles.body.value.find(item => item.properties.principalId === claims.oid
    && item.properties.roleDefinitionId.endsWith('/f58310d9-a9f6-439a-9e8d-f62e7b41a168'));
  assert.ok(delegated, 'Restricted delegation is missing');
  await assertDocumentDelegation(delegated.properties.condition);
  assert.ok(!roles.body.value.some(item => item.properties.principalId === claims.oid && item.properties.roleDefinitionId.endsWith('/' + roleId)), 'Do not collide with an existing workload grant');
  assert.equal((await request('azure', 'GET', apiPath)).status, 404);
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = subscription;
  arm = createArmServer({ store: new ResourceStore() });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  const setup = await httpExchange(`http://127.0.0.1:${arm.address().port}${scope}?api-version=2022-09-01`, { method: 'PUT', body: { location: existing.body.location }, headers: { authorization: 'Bearer globalstack-local-token' } });
  report.localSetup = sanitize(setup, replacements);
  assert.ok([200, 201].includes(setup.status), `Local group setup returned ${setup.status}`);
  await writeFile(journal, JSON.stringify({ assignment, properties }), { mode: 0o600, flag: 'wx' });
  submitted = true;
  for (const target of ['azure', 'local']) {
    const result = await request(target, 'PUT', apiPath, { properties });
    assert.ok([200, 201].includes(result.status), `${target} rejected the delegated assignment`);
    const read = await request(target, 'GET', apiPath);
    assert.equal(read.status, 200);
    assert.equal(read.body.properties.principalId, properties.principalId);
    assert.equal(read.body.properties.roleDefinitionId.toLowerCase(), properties.roleDefinitionId.toLowerCase());
  }
  report.assignmentRoundTrip = true;
} catch (error) { report.error = sanitize(error.message, replacements); }
finally {
  if (submitted) {
    try {
      const current = await request('azure', 'GET', apiPath);
      if (current.status !== 404) {
        assert.equal(current.status, 200);
        for (const key of ['principalId', 'roleDefinitionId', 'description']) assert.equal(current.body.properties[key], properties[key], 'Cleanup ownership mismatch');
        const removed = await request('azure', 'DELETE', apiPath);
        assert.ok([200, 204].includes(removed.status));
      }
      assert.equal((await request('azure', 'GET', apiPath)).status, 404);
      report.cleanup = true;
      await rm(journal);
    } catch (error) { report.cleanupError = sanitize(error.message, replacements); }
  }
  if (arm) {
    await request('local', 'DELETE', apiPath);
    await new Promise(done => arm.close(done));
  }
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, assignmentRoundTrip: report.assignmentRoundTrip, cleanup: report.cleanup, error: report.error, cleanupError: report.cleanupError }));
if (report.error || submitted && !report.cleanup) process.exitCode = 1;
