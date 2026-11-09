import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { productionBudgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';
import { cleanupDocumentSearch, documentSearchClient, documentSearchScope } from './document-search-cleanup.mjs';
import { provisionDocumentSearch } from './document-app/search-provision.mjs';
import { httpExchange } from './http-exchange.mjs';

assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit private run directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
assert.ok((await statfs(out)).bavail * (await statfs(out)).bsize >= 40 * 1024 ** 3, '40 GiB free required');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const account = azureCli(config, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const armToken = azureToken(config);
const claims = JSON.parse(Buffer.from(armToken.split('.')[1], 'base64url'));
assert.equal(claims.tid, account.tenantId);
assert.match(claims.oid, /^[0-9a-f-]{36}$/i);
const searchToken = azureCli(config, ['account', 'get-access-token', '--resource', 'https://search.azure.com/']).accessToken;
const searchClaims = JSON.parse(Buffer.from(searchToken.split('.')[1], 'base64url'));
assert.equal(searchClaims.tid, account.tenantId);
assert.equal(searchClaims.oid, claims.oid);
assert.ok(['https://search.azure.com', 'https://search.azure.com/'].includes(searchClaims.aud));
assert.ok([`https://login.microsoftonline.com/${account.tenantId}/v2.0`, `https://sts.windows.net/${account.tenantId}/`].includes(searchClaims.iss));
const keyResponse = await fetch(`https://login.microsoftonline.com/${account.tenantId}/discovery/v2.0/keys`, {
  redirect: 'error', signal: AbortSignal.timeout(10000),
});
assert.equal(keyResponse.status, 200, 'Microsoft signing keys were unavailable');
const keys = (await keyResponse.json()).keys.filter(key => key.kty === 'RSA' && key.use === 'sig')
  .map(key => ({ ...key, alg: 'RS256' }));
assert.ok(keys.length > 0 && keys.length <= 16, 'Signing key set is outside the supported limit');

const runId = randomBytes(6).toString('hex');
const manifest = { subscription: account.id, group: 'gs-conformance-pilot', runId, publisher: claims.oid,
  dataRoles: [randomUUID(), randomUUID()], searchRoles: Array.from({ length: 4 }, randomUUID),
  config, parentPid: process.pid, deadline: Date.now() + 60 * 60000 };
const s = documentSearchScope(manifest);
const replacements = [[armToken, '<redacted>'], [searchToken, '<redacted>'], [account.id, '<subscription>'],
  [account.tenantId, '<tenant>'], [claims.oid, '<pilot-principal>'], [runId, '<run>']];
const report = { schemaVersion: 1, revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Document Search identity, Storage and Search deployment, index/data-source provisioning, and immediate cleanup. No full document workflow.',
  budget: { totalAuthorizedUsd: 200, thisRunEnvelopeUsd: 12, actualAzureChargesMeasured: false },
  observations: [], stages: [], cleanup: null, fullWorkflowCompleted: false };
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done');
let phase = 'preflight', allocated = false, watchdog, arm, search, runtime;
function observe(target, event) {
  report.observations.push(sanitize({ target, phase, ...event }, replacements));
}
const azure = documentSearchClient({ ...manifest, token: armToken }, event => observe('azure', event));
async function local(method, path, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  observe('local', { method, path, request: body, ...result });
  return result;
}
async function pollDeployment(id) {
  while (true) {
    assert.ok(Date.now() < manifest.deadline - 15 * 60000, 'Search deployment runtime allowance exhausted');
    const result = await azure('GET', `${id}?api-version=2025-04-01`);
    if (result.status === 200 && ['Succeeded', 'Failed', 'Canceled'].includes(result.body?.properties?.provisioningState)) return result;
    assert.ok([200, 404, 429].includes(result.status), 'Search deployment polling failed');
    await new Promise(done => setTimeout(done, 5000));
  }
}
async function waitSearchReady() {
  const deadline = Math.min(Date.now() + 180000, manifest.deadline - 10 * 60000);
  while (true) {
    assert.ok(Date.now() < deadline, 'Azure Search did not become usable before the readiness deadline');
    const result = await httpExchange(`https://${s.name}-search.search.windows.net/indexes?api-version=2025-09-01`, {
      method: 'GET', timeoutMs: 30000, headers: { authorization: `Bearer ${searchToken}` },
    });
    observe('azure', { method: 'GET', path: '/indexes?api-version=2025-09-01', ...result });
    if (result.status === 200) return;
    assert.ok([403, 404, 429, 503].includes(result.status), 'Azure Search readiness failed with a terminal response');
    await new Promise(done => setTimeout(done, 5000));
  }
}
async function provision(target, token) {
  const endpoint = `https://${s.name}-search.search.windows.net`;
  const origin = target === 'azure' ? endpoint : `http://127.0.0.1:${search.address().port}`;
  return provisionDocumentSearch({ endpoint, storageResourceId: s.storage,
    credential: { async getToken() { return { token }; } },
    request: async (url, options) => {
      const path = new URL(url).pathname + new URL(url).search;
      const response = await httpExchange(`${origin}${path}`, { method: options.method,
        body: JSON.parse(options.body), timeoutMs: 30000,
        headers: { authorization: `Bearer ${token}`, ...(target === 'local' ? { host: `${s.name}-search.search.windows.net` } : {}) },
      });
      observe(target, { method: options.method, path, request: JSON.parse(options.body), ...response });
      return { status: response.status, json: async () => response.body };
    },
  });
}
try {
  assert.deepEqual(azureCli(config, ['resource', 'list', '--subscription', account.id]), [], 'Azure inventory is not empty');
  assert.equal((await azure('GET', `${s.group}?api-version=2022-09-01`)).status, 200);
  for (const id of [...s.resources, ...s.deployments]) {
    assert.equal((await azure('GET', `${id}?api-version=${s.version(id)}`)).status, 404, 'Previous pilot resource exists');
  }
  report.budget.ledger = await reserveBudget(productionBudgetPath, { runId, envelopeUsd: 12,
    purpose: 'Bounded document Search identity, Storage and indexer comparison in westus2' });
  allocated = true;
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/document-search-cleanup.mjs'),
    manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); });
  watchdog.unref();
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = account.id;
  const store = new ResourceStore();
  runtime = createEmulatorRuntime({ store, searchTokenTrusts: [{ issuer: searchClaims.iss, tenantId: account.tenantId,
    subscriptionIds: [account.id], jwks: { keys } }] });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  search = createSearchRouterServer(runtime.searchRouter);
  for (const server of [arm, search]) await new Promise(done => server.listen(0, '127.0.0.1', done));
  assert.ok([200, 201].includes((await local('PUT', `${s.group}?api-version=2022-09-01`, { location: 'westus2' })).status));
  const inputs = [
    ['search-identities', { serviceName: s.name }],
    ['data', { accountName: `${s.name}docs`, workerIdentityName: `${s.name}-worker`,
      publisherPrincipalId: claims.oid, roleAssignmentNames: manifest.dataRoles }],
    ['search', { serviceName: s.name, workerIdentityName: `${s.name}-worker`, ingressIdentityName: `${s.name}-ingress`,
      storageAccountName: `${s.name}docs`, publisherPrincipalId: claims.oid, roleAssignmentNames: manifest.searchRoles }],
  ];
  for (const [stage, params] of inputs) {
    phase = `deploy-${stage}`;
    const templateName = stage === 'search-identities' ? 'document-search-identities' : `document-${stage}`;
    const bytes = await readFile(new URL(`./document-infra/compiled/${templateName}.json`, import.meta.url));
    const templateSha256 = createHash('sha256').update(bytes).digest('hex');
    const template = JSON.parse(bytes);
    const deployment = s.deployments[inputs.findIndex(([name]) => name === stage)];
    const body = { properties: { mode: 'Incremental', template, parameters: Object.fromEntries(Object.entries({
      ...params, location: 'westus2', runId,
    }).map(([key, value]) => [key, { value }])) } };
    const first = await azure('PUT', `${deployment}?api-version=2025-04-01`, body);
    const terminal = [200, 201, 202].includes(first.status) ? await pollDeployment(deployment) : first;
    const replay = await local('PUT', `${deployment}?api-version=2025-04-01`, body);
    const result = { stage, templateSha256, azureStatus: first.status,
      azureState: terminal.body?.properties?.provisioningState ?? terminal.body?.error?.code ?? `HTTP ${terminal.status}`,
      localStatus: replay.status, localState: replay.body?.properties?.provisioningState ?? replay.body?.error?.code ?? `HTTP ${replay.status}` };
    report.stages.push(result);
    assert.equal(result.azureState, 'Succeeded', `Azure ${stage} deployment failed`);
    assert.equal(result.localState, 'Succeeded', `Local ${stage} deployment failed`);
  }
  phase = 'search-readiness-azure';
  await waitSearchReady();
  phase = 'provision-search-azure';
  report.azureProvision = await provision('azure', searchToken);
  phase = 'provision-search-local';
  try { report.localProvision = await provision('local', searchToken); }
  catch (error) { report.localProvisionError = sanitize(error.message, replacements); }
  report.comparisonComplete = true;
} catch (error) {
  report.error = sanitize(error.message, replacements);
} finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const cleanupToken = azureToken(config);
      replacements.push([cleanupToken, '<redacted>']);
      report.cleanup = await cleanupDocumentSearch(manifest, documentSearchClient({ ...manifest, token: cleanupToken }, event => observe('azure', event)));
      assert.deepEqual(azureCli(config, ['resource', 'list', '--subscription', account.id]), [], 'Azure inventory not empty after cleanup');
      await writeFile(donePath, 'verified\n', { mode: 0o600 });
      watchdog?.kill('SIGTERM');
      await rm(manifestPath);
      await confirmBudgetCleanup(productionBudgetPath, runId);
    } catch (error) { report.cleanup = { cleanupComplete: false, recoveryRequired: true, error: sanitize(error.message, replacements) }; }
  }
  if (arm) {
    await local('DELETE', `${s.group}?api-version=2022-09-01`).catch(() => {});
    for (const server of [search, arm].filter(Boolean)) {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
    }
  }
  await runtime?.dispose();
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, stages: report.stages, azureProvision: report.azureProvision?.length,
  localProvisionError: report.localProvisionError, cleanup: report.cleanup, error: report.error ?? null }));
if (report.error || report.localProvisionError || !report.comparisonComplete || !report.cleanup?.resourcesAbsent) process.exitCode = 1;
