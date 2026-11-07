import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('native Durable failure capture executed retries and retained the terminal failure', async () => {
  const prefix = new URL('./evidence/functions-orchestration-bf66e7f/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', prefix), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, prefix));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = JSON.parse(await readFile(new URL('result.json', prefix), 'utf8'));
  assert.equal(report.sourceDirty, false);
  assert.equal(report.configurationMode, 'expected-application-failure');
  assert.equal(report.workerHealthReady, true); assert.equal(report.durableWorkerStarted, true);
  assert.equal(report.hostLeaseAcquired, true); assert.equal(report.cleanup, true);
  assert.equal(report.businessWorkflowCompleted, false); assert.equal(report.expectedFailurePersisted, true);
  assert.equal(report.orchestrationStart.status, 202);
  assert.equal(report.orchestrationPolls.at(-1).runtimeStatus, 'Failed');
  assert.equal(report.orchestrationPolls.at(-1).status, 200);
  assert.ok(report.requests.some(item => item.surface === 'table' && item.path === '/$batch' && item.status === 202));
  assert.deepEqual(report.requests.filter(item => item.surface === 'table' && item.status >= 400), []);
  const log = await readFile(new URL('host.log', prefix), 'utf8');
  for (const activity of ['scanAndStore', 'recordProcessingFailure']) {
    const observed = [...log.matchAll(new RegExp(`Executed 'Functions\\.${activity}' \\(Failed`, 'g'))].length;
    assert.equal(observed, 3); assert.equal(index.activityFailures[activity], observed);
  }
});

const base = new URL('./evidence/', import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, base), 'utf8'));
test('later hosting retry preserves nested throttling and verified cleanup', async () => {
  const prefix = 'web-throttle-a2ec5ef/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(`${prefix}result.json`);
  assert.equal(report.sourceDirty, false);
  assert.match(report.error, /throttled/);
  assert.deepEqual(report.cleanup, { groupAbsent: true, plansAbsent: true, deploymentAbsent: true });
  assert.ok(report.exchanges.some(exchange => exchange.target === 'azure' && exchange.phase === 'azure-deployment-diagnostic'
    && exchange.body?.value?.some(operation => operation.properties?.statusCode === 429)));
  assert.ok(report.exchanges.some(exchange => exchange.target === 'azure' && exchange.method === 'POST'
    && exchange.path.includes('/cancel?') && exchange.status === 204));
});
test('scanner evidence retains the concurrent timeout and subsequent real HTTP recovery', async () => {
  for (const prefix of ['scanner-vendor-2c9f2f4/', 'scanner-daemon-cd26108/']) {
    const index = await load(`${prefix}index.json`);
    for (const [name, metadata] of Object.entries(index.files)) {
      const bytes = await readFile(new URL(prefix + name, base));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
      assert.equal(bytes.length, metadata.bytes);
    }
  }
  const before = await load('scanner-vendor-2c9f2f4/concurrent-vendor-probe.json');
  assert.deepEqual(before.results.map(item => item.status), ['unresolved', 'clean']);
  assert.equal(before.results[0].engines[0].reason, 'engine_unavailable_or_timed_out');
  assert.equal(before.results[0].pages, undefined);
  const signatures = (await load('scanner-vendor-2c9f2f4/clean-vendor-scan.json')).provenance;
  const after = await load('scanner-daemon-cd26108/result.json');
  assert.equal(after.complete, true); assert.equal(after.cleanup, true);
  assert.equal(after.correlatedScans, true); assert.equal(after.readinessFailedClosed, true);
  assert.equal(after.requests.length, 9);
  const scans = after.requests.filter(item => item.expected);
  assert.equal(scans.length, 7);
  for (const item of scans) {
    assert.equal(item.httpStatus, 200);
    assert.equal(item.body.status, item.expected);
    assert.deepEqual(item.body.provenance, signatures);
  }
  assert.deepEqual(after.requests.filter(item => item.case.startsWith('concurrent-')).map(item => item.body.status), ['clean', 'clean']);
  assert.equal(after.requests.find(item => item.case === 'engine-loss-health').httpStatus, 503);
  assert.equal(after.requests.find(item => item.case === 'engine-loss-scan').body.pages, undefined);
  const logs = (await readFile(new URL('scanner-daemon-cd26108/server.log', base), 'utf8')).trim().split('\n').map(JSON.parse);
  for (const item of scans) {
    const observed = logs.filter(log => log.correlationId === item.correlationId);
    assert.equal(observed.length, 1);
    assert.equal(observed[0].contentHash, item.body.sha256);
    assert.equal(observed[0].status, item.expected);
  }
});

test('Web validation preserves Azure quota rejection separately from unsupported local validation', async () => {
  const prefix = 'web-validation-4a4ee94/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(`${prefix}result.json`);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.provisioningPerformed, false);
  assert.equal(report.noResourcesCreated, true);
  assert.equal(report.portalEvidenceComplete, false);
  assert.equal(report.attempts.length, 3);
  const regions = [];
  for (const attempt of report.attempts) {
    const [azure, local] = attempt.targets;
    assert.deepEqual(attempt.targets.map(item => item.target), ['azure', 'local']);
    assert.deepEqual(azure.request, local.request);
    regions.push(azure.request.properties.parameters.location.value);
    assert.equal(azure.status, 400);
    assert.equal(azure.body.error.code, 'InvalidTemplateDeployment');
    const errors = azure.body.error.details[0].details;
    assert.equal(errors.length, 2);
    for (const error of errors) assert.equal(error.code, 'SubscriptionIsOverQuotaForSku');
    assert.equal(local.status, 501);
    assert.equal(local.body.error.code, 'GlobalStackValidationNotImplemented');
    assert.equal(attempt.sameStatusAndErrorCode, false);
  }
  assert.deepEqual(regions, ['westus2', 'eastus2', 'canadacentral']);
  assert.ok(report.probes.every(probe => probe.status === 404));
  const events = await readFile(new URL(`${prefix}events.ndjson`, base));
  const recording = await load(`${prefix}recording.json`);
  assert.equal(createHash('sha256').update(events).digest('hex'), recording.eventSha256);
});

test('retained scenario diagnostics preserve integrity and do not claim application success', async () => {
  const index = await load('index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const data = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(data).digest('hex'), metadata.sha256);
  }
  const report = await load('validation.json');
  assert.equal(report.sourceDirty, false);
  assert.equal(report.provisioningPerformed, false);
  assert.equal(report.noResourcesCreated, true);
  assert.equal(report.validationTerminalsComplete, true);
  assert.equal(report.fullProtocolParityEvaluated, false);
  assert.equal(report.portalEvidenceComplete, false);
  assert.equal(report.attempts.length, 4);
  for (const attempt of report.attempts) {
    assert.deepEqual(attempt.targets.map(item => item.target), ['azure', 'local']);
    assert.deepEqual(attempt.targets[0].request, attempt.targets[1].request);
    assert.equal(attempt.sameStatusAndErrorCode, false);
    assert.ok(attempt.targets.every(item => item.terminalObserved));
  }
  assert.equal(report.attempts[0].targets[0].body.error.code, 'InvalidTemplate');
  assert.equal(report.attempts[2].targets[0].body.error.details[0].code, 'InvalidServiceName');
  assert.equal(report.attempts[3].targets[0].status, 200);
  assert.ok(report.probes.every(item => item.status === 404));
  const events = await readFile(new URL('validation-events.ndjson', base));
  const recording = await load('validation-recording.json');
  assert.equal(createHash('sha256').update(events).digest('hex'), recording.eventSha256);
  assert.equal(events.toString().trim().split('\n').length, recording.eventCount);
});

test('all 101 application assertions remain required and unexecuted', async () => {
  const manifest = JSON.parse(await readFile(new URL('./requirements.json', import.meta.url), 'utf8'));
  assert.equal(manifest.assertions.length, 101);
  assert.equal(new Set(manifest.assertions.map(item => item.id)).size, 101);
  for (const item of manifest.assertions) {
    assert.equal(item.required, true);
    assert.equal(item.azure, 'not-run');
    assert.equal(item.globalstack, 'not-run');
  }
});

test('partial fixes retain the initial-status difference and remaining local failures', async () => {
  const prefix = 'validation-after-4b40af6/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const data = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(data).digest('hex'), metadata.sha256);
    assert.equal(data.byteLength, metadata.bytes);
  }
  const report = await load(`${prefix}validation.json`);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.noResourcesCreated, true);
  assert.equal(report.provisioningPerformed, false);
  assert.equal(report.validationTerminalsComplete, true);
  assert.equal(report.fullProtocolParityEvaluated, false);
  assert.equal(report.portalEvidenceComplete, false);
  for (const attempt of report.attempts) {
    const [azure, local] = attempt.targets;
    assert.deepEqual(attempt.targets.map(item => item.target), ['azure', 'local']);
    assert.deepEqual(azure.request, local.request);
    const terminal = azure.polls.at(-1) ?? azure;
    assert.equal(terminal.status, local.status);
    assert.equal(terminal.body?.error?.code, local.body?.error?.code);
  }
  assert.equal(report.attempts[1].targets[0].status, 202);
  assert.equal(report.attempts[1].targets[1].status, 200);
  const recording = await load(`${prefix}validation-recording.json`);
  const events = await readFile(new URL(`${prefix}validation-events.ndjson`, base));
  assert.equal(createHash('sha256').update(events).digest('hex'), recording.eventSha256);
  const local = await load(`${prefix}local-gaps.json`);
  assert.equal(local.sourceDirty, false);
  assert.equal(local.results.find(item => item.id === 'search-multiple-keys').status, 'pass');
  assert.deepEqual(local.results.filter(item => item.status === 'fail').map(item => item.id), [
    'search-fuzzy', 'search-invalid-vector', 'apim-backend-forwarding',
  ]);
});

test('native worker routing capture preserves host authentication, real execution and teardown failures', async () => {
  const prefix = 'functions-native-routing-9ad66d3/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const result = await load(`${prefix}result.json`);
  assert.equal(result.sourceDirty, false);
  assert.equal(result.sourceRevision, '9ad66d31634616e9b8283dedc6d375001c99f49b');
  assert.equal(result.cleanup, true); assert.equal(result.businessWorkflowCompleted, false);
  assert.equal(result.workerHealthReady, true); assert.equal(result.durableWorkerStarted, true);
  assert.equal(result.expectedFailurePersisted, true);
  assert.equal(result.orchestrationStart.status, 202);
  assert.equal(result.orchestrationPolls.at(-1).runtimeStatus, 'Failed');
  assert.equal(result.nativeRouting.unauthorizedStatus, 401);
  assert.equal(result.nativeRouting.stoppedWorkerStatus, 502);
  assert.equal(result.nativeRouting.deletedSiteStatus, 404);
  const health = result.nativeRouting.requests.filter(item => item.path === '/api/health');
  assert.ok(health.some(item => item.status === 200));
  assert.deepEqual(health.slice(-2).map(item => item.status), [502, 404]);
  const log = await readFile(new URL(prefix + 'host.log', base), 'utf8');
  for (const activity of ['scanAndStore', 'recordProcessingFailure']) {
    const count = [...log.matchAll(new RegExp(`Executed 'Functions\\.${activity}' \\(Failed`, 'g'))].length;
    assert.equal(count, 3); assert.equal(index.activityFailures[activity], count);
  }
});

test('native host key capture uses genuine runtime keys and removes private bootstrap credentials', async () => {
  const prefix = 'functions-native-keys-1697560/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const result = await load(`${prefix}result.json`);
  assert.equal(result.sourceDirty, false);
  assert.equal(result.sourceRevision, '1697560641a36a63da6d0a0c96e1548e211b1857');
  assert.equal(result.cleanup, true); assert.equal(result.businessWorkflowCompleted, false);
  assert.equal(result.expectedFailurePersisted, true);
  assert.equal(result.orchestrationStart.status, 202);
  assert.equal(result.orchestrationPolls.at(-1).runtimeStatus, 'Failed');
  assert.deepEqual(result.nativeRouting.hostKeys, { status: 200, masterMatches: true,
    systemKeyNames: ['durabletask_extension', 'eventgrid_extension'], functionKeyNames: ['default'], durableKeyMatches: true });
  assert.equal(result.nativeRouting.managementCredentialRemoved, true);
  assert.equal(result.nativeRouting.unauthorizedStatus, 401);
  assert.equal(result.nativeRouting.stoppedWorkerStatus, 502);
  assert.equal(result.nativeRouting.deletedSiteStatus, 404);
  const log = await readFile(new URL(prefix + 'host.log', base), 'utf8');
  for (const activity of ['scanAndStore', 'recordProcessingFailure']) {
    assert.equal([...log.matchAll(new RegExp(`Executed 'Functions\\.${activity}' \\(Failed`, 'g'))].length, 3);
  }
});

test('fresh Azure range comparison preserves bytes, protocol differences and cleanup', async () => {
  const prefix = new URL('./evidence/blob-ranges-after-f35ea4f/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', prefix)));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, prefix));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256); assert.equal(bytes.length, metadata.bytes);
  }
  const { compareBlobRanges } = await import('./compare-blob-ranges.mjs');
  const report = JSON.parse(await readFile(new URL('result.json', prefix)));
  const comparison = compareBlobRanges(report);
  assert.deepEqual(comparison, JSON.parse(await readFile(new URL('comparison.json', prefix))));
  assert.equal(comparison.comparedPhases, 21); assert.equal(comparison.knownDifferences.length, 1);
  for (const mutate of [
    report => { report.cleanup.accountAbsent = false; },
    report => { report.exchanges.find(item => item.target === 'local' && item.phase === 'range-bounded').body = 'wrong'; },
    report => { report.exchanges.find(item => item.target === 'local' && item.phase === 'range-past-end').status = 200; },
    report => { report.exchanges = report.exchanges.filter(item => !(item.target === 'local' && item.phase === 'range-historical')); },
  ]) {
    const changed = structuredClone(report); mutate(changed); assert.throws(() => compareBlobRanges(changed));
  }
});

test('native Event Grid evidence ties a Blob upload to a real failed document trigger', async () => {
  const prefix = new URL('./evidence/functions-native-events-3f4300f/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', prefix)));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, prefix));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256); assert.equal(bytes.length, metadata.bytes);
  }
  const report = JSON.parse(await readFile(new URL('result.json', prefix)));
  assert.equal(report.sourceDirty, false); assert.equal(report.cleanup, true);
  assert.equal(report.nativeRouting.managementCredentialRemoved, true);
  assert.equal(report.nativeEventDelivery.uploadStatus, 201);
  assert.equal(report.nativeEventDelivery.businessWorkflowCompleted, false);
  assert.equal(report.nativeEventDelivery.pending, 0);
  assert.deepEqual(report.nativeEventDelivery.functionExecutions, ['Failed']);
  assert.equal(report.nativeEventDelivery.diagnostics.length, 1);
  assert.equal(report.nativeEventDelivery.diagnostics[0].state, 'exhausted');
  assert.equal(report.nativeEventDelivery.diagnostics[0].reason, 'NativeEventGridHttp500');
  const log = await readFile(new URL('host.log', prefix), 'utf8');
  assert.match(log, /Executed 'Functions\.documentUploaded' \(Failed/);
  assert.match(log, /Missing application setting STORAGE_ENDPOINT/);
});

test('native identity capture retains SDK authorization and cleanup without claiming workflow success', async () => {
  const prefix = 'functions-native-identity-0e584f3/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(`${prefix}result.json`);
  assert.equal(report.sourceRevision, index.sourceRevision);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.cleanup, true);
  assert.equal(report.nativeIdentity.cleanup, true);
  assert.equal(report.nativeRouting.managementCredentialRemoved, true);
  assert.equal(report.businessWorkflowCompleted, false);
  assert.equal(report.expectedFailurePersisted, true);
  assert.deepEqual(report.nativeIdentity.sdk, [
    { phase: 'authorized', historicalRead: true, rangeRead: true, deletedCurrentRead: true },
    { phase: 'role-removed', readStatus: 403, writeStatus: 403 },
  ]);
  assert.ok(report.nativeIdentity.requests.every(request => request.bearer));
  assert.ok(report.nativeIdentity.requests.some(request => request.method === 'GET' && request.status === 206));
  assert.deepEqual(report.nativeIdentity.requests.slice(-2).map(request => request.status), [403, 403]);
  assert.equal(report.nativeRouting.stoppedWorkerStatus, 502);
  assert.equal(report.nativeRouting.deletedSiteStatus, 404);
});

test('scoped validation evidence preserves the routing failure and fresh paired acceptance', async () => {
  for (const [prefix, localStatus] of [['scoped-preflight-before-14e4f4a/', 501], ['scoped-preflight-after-73b25e3/', 200]]) {
    const index = await load(prefix + 'index.json');
    for (const [name, metadata] of Object.entries(index.files)) {
      const bytes = await readFile(new URL(prefix + name, base));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
      assert.equal(bytes.length, metadata.bytes);
    }
    const report = await load(prefix + 'result.json');
    assert.equal(report.sourceDirty, false); assert.equal(report.cloudResourcesProvisioned, false);
    assert.equal(report.resourceCountBefore, 0); assert.equal(report.resourceCountAfter, 0);
    const attempts = report.exchanges.filter(item => item.method === 'POST');
    assert.deepEqual(attempts.map(item => item.status), [200, localStatus]);
    assert.deepEqual(attempts[0].request, attempts[1].request);
  }
});
test('native database adapter evidence verifies TLS and secret-role removal without claiming a workflow', async () => {
  const prefix = 'functions-native-database-14e4f4a/';
  const index = await load(prefix + 'index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(prefix + 'result.json');
  assert.equal(report.sourceRevision, index.sourceRevision); assert.equal(report.sourceDirty, false);
  assert.equal(report.cleanup, true); assert.equal(report.businessWorkflowCompleted, false); assert.equal(report.error, undefined);
  const database = report.nativeIdentity.database;
  assert.equal(database.cleanup, true);
  assert.deepEqual(database.vaultRequests.map(item => item.status), [200, 403]);
  assert.ok(database.vaultRequests.every(item => item.bearer));
  assert.deepEqual(database.checks, [{ phase: 'authorized', encrypted: true, tlsVersion: 'TLSv1.3', schemaMigrated: true },
    { phase: 'untrusted-ca', certificateRejected: true }, { phase: 'role-removed', connectionDenied: true }]);
});
