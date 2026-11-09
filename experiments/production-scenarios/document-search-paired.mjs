import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { productionBudgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';
import { cleanupDocumentSearch, documentSearchClient, documentSearchScope } from './document-search-cleanup.mjs';
import { provisionDocumentSearch } from './document-app/search-provision.mjs';
import { projectionDataSource, projectionIndexer } from './document-app/search-projection.mjs';
import { httpExchange } from './http-exchange.mjs';
import { assertDocumentDelegation } from './operator/delegation-check.mjs';
import { waitForSearchReadiness } from './search-readiness.mjs';
import { tokenNeedsRefresh, validateWorkloadToken } from './workload-token.mjs';

assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit private run directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
assert.ok((await statfs(out)).bavail * (await statfs(out)).bsize >= 40 * 1024 ** 3, '40 GiB free required');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const certificate = process.env.PAIRED_AZURE_CERTIFICATE_FILE;
assert.ok(config && certificate, 'A durable Azure CLI config and certificate are required');
const realOut = await realpath(out);
for (const [label, value] of [['Azure CLI config', config], ['Azure certificate', certificate]]) {
  const actual = await realpath(value);
  assert.ok(actual !== realOut && !actual.startsWith(realOut + sep), `${label} must be outside the disposable run directory`);
}
const account = azureCli(config, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const armToken = azureToken(config);
const claims = JSON.parse(Buffer.from(armToken.split('.')[1], 'base64url'));
assert.equal(claims.tid, account.tenantId);
assert.match(claims.oid, /^[0-9a-f-]{36}$/i);
let searchToken = azureCli(config, ['account', 'get-access-token', '--resource', 'https://search.azure.com/']).accessToken;
let storageToken = azureCli(config, ['account', 'get-access-token', '--resource', 'https://storage.azure.com/']).accessToken;
const searchClaims = JSON.parse(Buffer.from(searchToken.split('.')[1], 'base64url'));
assert.equal(searchClaims.tid, account.tenantId);
assert.equal(searchClaims.oid, claims.oid);
assert.ok(['https://search.azure.com', 'https://search.azure.com/'].includes(searchClaims.aud));
const storageClaims = JSON.parse(Buffer.from(storageToken.split('.')[1], 'base64url'));
assert.equal(storageClaims.oid, claims.oid);
assert.ok(['https://storage.azure.com', 'https://storage.azure.com/'].includes(storageClaims.aud));
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
  dataRoles: [randomUUID(), randomUUID()], searchRoles: Array.from({ length: 5 }, randomUUID),
  config, parentPid: process.pid, deadline: Date.now() + 60 * 60000 };
const s = documentSearchScope(manifest);
const replacements = [[armToken, '<redacted>'], [searchToken, '<redacted>'], [storageToken, '<redacted>'], [account.id, '<subscription>'],
  [account.tenantId, '<tenant>'], [claims.oid, '<pilot-principal>'], [runId, '<run>']];
const report = { schemaVersion: 1, revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Document Search identity, Storage and Search deployment, index/data-source provisioning, Blob projection traversal, and immediate cleanup. No full document workflow.',
  budget: { thisRunEnvelopeUsd: 12, actualAzureChargesMeasured: false },
  observations: [], stages: [], cleanup: null, fullWorkflowCompleted: false };
const emit = createRecording(out, { platform: 'document Search paired pilot', revision, sourceDirty: false,
  evidence: 'time-ordered API trace; no Portal screenshots or video' });
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done');
let phase = 'preflight', allocated = false, watchdog, arm, search, blob, runtime;
function observe(target, event) {
  const safe = sanitize({ target, phase, ...event }, replacements);
  report.observations.push(safe);
  emit('http', { target, phase, method: safe.method, path: safe.path, status: safe.status,
    code: safe.body?.error?.code ?? null });
}
function refreshWorkloadToken(resource, previous) {
  const next = azureCli(config, ['account', 'get-access-token', '--resource', resource]).accessToken;
  validateWorkloadToken(next, { tenantId: account.tenantId, principalId: claims.oid,
    issuer: searchClaims.iss, audiences: resource === 'https://search.azure.com/'
      ? ['https://search.azure.com', 'https://search.azure.com/']
      : ['https://storage.azure.com', 'https://storage.azure.com/'] });
  if (next !== previous) replacements.push([next, '<redacted>']);
  return next;
}
function freshSearchToken() {
  if (tokenNeedsRefresh(searchToken)) searchToken = refreshWorkloadToken('https://search.azure.com/', searchToken);
  return searchToken;
}
function freshStorageToken() {
  if (tokenNeedsRefresh(storageToken)) storageToken = refreshWorkloadToken('https://storage.azure.com/', storageToken);
  return storageToken;
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
  const deadline = Math.min(Date.now() + 10 * 60000, manifest.deadline - 10 * 60000);
  await waitForSearchReadiness({ deadline,
    request: () => httpExchange(`https://${s.name}-search.search.windows.net/indexes?api-version=2025-09-01`, {
      method: 'GET', timeoutMs: 30000, headers: { authorization: `Bearer ${freshSearchToken()}` },
    }),
    observe: result => observe('azure', { method: 'GET', path: '/indexes?api-version=2025-09-01', ...result }),
    refreshToken: () => {
      searchToken = refreshWorkloadToken('https://search.azure.com/', searchToken);
    },
  });
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
async function searchRequest(target, method, path, body) {
  const origin = target === 'azure' ? `https://${s.name}-search.search.windows.net` : `http://127.0.0.1:${search.address().port}`;
  const result = await httpExchange(`${origin}${path}?api-version=2025-09-01`, { method, body,
    headers: { authorization: `Bearer ${freshSearchToken()}`,
      ...(target === 'local' ? { host: `${s.name}-search.search.windows.net` } : {}) } });
  observe(target, { method, path: `${path}?api-version=2025-09-01`, request: body, ...result });
  return result;
}
async function blobPut(target, container, name, document, deleted = false) {
  const accountName = `${s.name}docs`;
  const origin = target === 'azure' ? `https://${accountName}.blob.core.windows.net` : `http://127.0.0.1:${blob.address().port}`;
  const bytes = Buffer.from(JSON.stringify(document));
  const path = `/${container}/${name}.json`;
  const result = await httpExchange(origin + path, { method: 'PUT', body: bytes, headers: {
    authorization: `Bearer ${freshStorageToken()}`, host: `${accountName}.blob.core.windows.net`,
    'x-ms-version': '2023-11-03', 'x-ms-blob-type': 'BlockBlob',
    'x-ms-meta-isdeleted': deleted ? 'true' : 'false', 'content-type': 'application/json',
  } });
  observe(target, { method: 'PUT', path, request: { sha256: createHash('sha256').update(bytes).digest('hex'), deleted }, ...result });
  return result;
}
async function projectionQuery(target, documentId) {
  const result = await searchRequest(target, 'POST', "/indexes('document-projection')/docs/search", {
    search: '*', filter: `document_id eq '${documentId}'`, select: 'document_id,revision_id', top: 2,
  });
  assert.equal(result.status, 200, `${target} projection query failed`);
  return result.body?.value ?? [];
}
async function waitProjection(target, documentId, present) {
  const deadline = Date.now() + 180000;
  while (true) {
    const rows = await projectionQuery(target, documentId);
    if (present ? rows.some(row => row.document_id === documentId) : rows.length === 0) return rows;
    assert.ok(Date.now() < deadline, `${target} projection did not reach the expected state`);
    await new Promise(done => setTimeout(done, 5000));
  }
}
async function wrongContainerProbe(target, quarantineId) {
  const dataSourceName = 'quarantine-probe-source';
  const indexerName = 'quarantine-probe-indexer';
  const outcome = { target, stages: [] };
  const source = { ...projectionDataSource(s.storage), name: dataSourceName, container: { name: 'quarantine' } };
  phase = `wrong-container-source-${target}`;
  const created = await searchRequest(target, 'PUT', `/datasources('${dataSourceName}')`, source);
  outcome.stages.push({ name: 'data-source', status: created.status, code: created.body?.error?.code ?? null });
  if (![200, 201].includes(created.status)) return outcome;
  const indexer = { ...projectionIndexer, name: indexerName, dataSourceName };
  phase = `wrong-container-indexer-${target}`;
  const configured = await searchRequest(target, 'PUT', `/indexers('${indexerName}')`, indexer);
  outcome.stages.push({ name: 'indexer', status: configured.status, code: configured.body?.error?.code ?? null });
  if (![200, 201].includes(configured.status)) {
    outcome.quarantineIndexed = (await projectionQuery(target, quarantineId)).length > 0;
    return outcome;
  }
  phase = `wrong-container-run-${target}`;
  const started = await searchRequest(target, 'POST', `/indexers('${indexerName}')/search.run`);
  outcome.stages.push({ name: 'run', status: started.status, code: started.body?.error?.code ?? null });
  if (started.status !== 202) return outcome;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const status = await searchRequest(target, 'GET', `/indexers('${indexerName}')/search.status`);
    assert.equal(status.status, 200, `${target} wrong-container status request failed`);
    if (status.body?.lastResult?.status && status.body.lastResult.status !== 'inProgress') {
      outcome.indexerStatus = status.body.lastResult.status;
      outcome.indexerErrorCount = status.body.lastResult.errors?.length ?? 0;
      break;
    }
    await new Promise(done => setTimeout(done, 5000));
  }
  outcome.quarantineIndexed = (await projectionQuery(target, quarantineId)).length > 0;
  return outcome;
}
try {
  assert.deepEqual(azureCli(config, ['resource', 'list', '--subscription', account.id]), [], 'Azure inventory is not empty');
  assert.equal((await azure('GET', `${s.group}?api-version=2022-09-01`)).status, 200);
  const assignments = azureCli(config, ['role', 'assignment', 'list', '--scope', s.group]);
  const delegation = assignments.find(item => item.principalId?.toLowerCase() === claims.oid.toLowerCase()
    && item.scope?.toLowerCase() === s.group.toLowerCase()
    && item.roleDefinitionId?.toLowerCase().endsWith('/f58310d9-a9f6-439a-9e8d-f62e7b41a168'));
  assert.ok(delegation, 'Pilot role delegation is missing');
  await assertDocumentDelegation(delegation.condition);
  for (const id of [...s.resources, ...s.deployments]) {
    assert.equal((await azure('GET', `${id}?api-version=${s.version(id)}`)).status, 404, 'Previous pilot resource exists');
  }
  report.budget.ledger = await reserveBudget(productionBudgetPath, { runId, envelopeUsd: 12,
    purpose: 'Bounded document Search identity, Storage and indexer comparison in westus2' });
  report.budget.totalAuthorizedUsd = report.budget.ledger.totalAuthorizedUsd;
  allocated = true;
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/document-search-cleanup.mjs'),
    manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); });
  watchdog.unref();
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = account.id;
  const store = new ResourceStore();
  const trust = { issuer: searchClaims.iss, tenantId: account.tenantId,
    subscriptionIds: [account.id], jwks: { keys } };
  runtime = createEmulatorRuntime({ store, searchTokenTrusts: [trust], storageTokenTrusts: [trust] });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  search = createSearchRouterServer(runtime.searchRouter);
  blob = createServer(runtime.storageRouter.blobHandler());
  for (const server of [arm, search, blob]) await new Promise(done => server.listen(0, '127.0.0.1', done));
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
  report.authAtSearchReadiness = { initialTokenMinutesRemaining: Math.floor((searchClaims.exp - Date.now() / 1000) / 60) };
  searchToken = refreshWorkloadToken('https://search.azure.com/', searchToken);
  storageToken = refreshWorkloadToken('https://storage.azure.com/', storageToken);
  await waitSearchReady();
  phase = 'provision-search-azure';
  report.azureProvision = await provision('azure', freshSearchToken());
  phase = 'provision-search-local';
  try { report.localProvision = await provision('local', freshSearchToken()); }
  catch (error) { report.localProvisionError = sanitize(error.message, replacements); }
  if (!report.localProvisionError) {
    const documentId = `doc-${runId}`;
    const quarantineId = `quarantine-${runId}`;
    report.searchTraversal = [];
    for (const target of ['azure', 'local']) {
      phase = `projection-upload-${target}`;
      assert.equal((await blobPut(target, 'clean-projection', documentId, {
        document_id: documentId, extracted_text: 'harmless projection probe', revision_id: 'r1', deleted: 'false',
      })).status, 201, `${target} projection upload failed`);
      assert.equal((await blobPut(target, 'quarantine', quarantineId, {
        document_id: quarantineId, extracted_text: 'must not be indexed', revision_id: 'r1', deleted: 'false',
      })).status, 201, `${target} quarantine probe upload failed`);
      phase = `projection-index-${target}`;
      assert.equal((await searchRequest(target, 'POST', "/indexers('document-projection-indexer')/search.run")).status, 202);
      const indexed = await waitProjection(target, documentId, true);
      assert.equal((await projectionQuery(target, quarantineId)).length, 0, `${target} indexed quarantine content`);
      report.searchTraversal.push({ target, indexed: indexed[0]?.document_id === documentId, quarantineExcluded: true });
      phase = `projection-delete-${target}`;
      assert.equal((await blobPut(target, 'clean-projection', documentId, {
        document_id: documentId, revision_id: 'r2', deleted: 'true',
      }, true)).status, 201, `${target} tombstone upload failed`);
      assert.equal((await searchRequest(target, 'POST', "/indexers('document-projection-indexer')/search.run")).status, 202);
      await waitProjection(target, documentId, false);
      report.searchTraversal.at(-1).softDeleteObserved = true;
      const status = await searchRequest(target, 'GET', "/indexers('document-projection-indexer')/search.status");
      report.searchTraversal.at(-1).indexerStatus = status.body?.lastResult?.status ?? `HTTP ${status.status}`;
    }
    report.negativeWiring = [];
    for (const target of ['azure', 'local']) report.negativeWiring.push(await wrongContainerProbe(target, quarantineId));
    assert.ok(report.negativeWiring.every(item => item.stages.length === 2
      && item.stages[0].status === 201 && item.stages[1].status === 401
      && item.stages[1].code === '' && item.quarantineIndexed === false),
    'Wrong-container probe did not reject indexer creation on both targets');
    report.comparisonComplete = true;
  }
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
    for (const server of [blob, search, arm].filter(Boolean)) {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
    }
  }
  await runtime?.dispose();
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  emit('run-end', { comparisonComplete: report.comparisonComplete === true, cleanup: report.cleanup,
    error: report.error ?? report.localProvisionError ?? null });
}
console.log(JSON.stringify({ out, stages: report.stages, azureProvision: report.azureProvision?.length,
  localProvisionError: report.localProvisionError, cleanup: report.cleanup, error: report.error ?? null }));
if (report.error || report.localProvisionError || !report.comparisonComplete || !report.cleanup?.resourcesAbsent) process.exitCode = 1;
