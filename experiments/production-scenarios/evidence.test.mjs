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

test('paired document infrastructure evidence separates deployment success from full workflow completion', async () => {
  const report = await load('document-event-azure-ada3cf8/summary.json');
  assert.equal(report.sourceRevision, 'ada3cf8e828bd3aadb04fd2af2131fd71eca3529');
  assert.equal(report.templates.find(item => item.name === 'document-events').sha256,
    'd5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09');
  assert.equal(report.stages.length, 7);
  assert.ok(report.stages.every(item => item.azure.state === 'Succeeded' && item.local.state === 'Succeeded'));
  assert.deepEqual(report.scannerCalls.map(item => [item.azureDecision, item.globalstackDecision]),
    [['clean', 'clean'], ['detected', 'detected'], ['detected', 'detected']]);
  assert.deepEqual(report.automaticCleanup, { resourcesAbsent: true, groupEmpty: true, localCleanupComplete: true });
  assert.deepEqual(report.independentAzureReadback, { resources: 0, deploymentRecords: 0 });
  assert.equal(report.fullWorkflowCompleted, false);
  assert.equal(report.portalEvidenceComplete, false);
});

test('local document upload capture records the event attempt without claiming application success', async () => {
  const report = await load('document-upload-local-77d7294/summary.json');
  assert.equal(report.sourceRevision, '77d729462a879da32f8092674ccfea542effa9c6');
  assert.equal(report.sourceDirty, false);
  assert.equal(report.target, 'GlobalStack only');
  assert.equal(report.templateSha256.documentData,
    'ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e');
  assert.equal(report.templateSha256.documentEvents,
    'd5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09');
  assert.equal(report.workerState, 'running');
  assert.equal(report.healthStatus, 200);
  assert.equal(report.uploadFunctionDiscovered, true);
  assert.equal(report.managedIdentityBlobUploadStatus, 201);
  assert.equal(report.eventSubscriptionMatched, true);
  assert.deepEqual(report.eventDelivery, { attempts: 1, state: 'retrying', reason: 'NativeEventGridHttp500' });
  assert.equal(report.cleanupComplete, true);
  assert.equal(report.fullDocumentWorkflowCompleted, false);
  assert.equal(report.azurePaired, false);
});

test('paired upload attempt retains Azure route failure and verified teardown', async () => {
  const report = await load('document-upload-azure-0ac25f3/summary.json');
  assert.equal(report.sourceRevision, '0ac25f3d98e6fa0fc7169477c9eb7dfc62ca17bf');
  assert.equal(report.sourceDirty, false);
  assert.deepEqual(report.documentDataDeployment, { azure: 'Succeeded', globalstack: 'Succeeded' });
  assert.deepEqual(report.documentEventsDeployment, { azure: 'Succeeded', globalstack: 'Succeeded' });
  assert.deepEqual(report.workerAppUpdate, { azure: 'Succeeded', globalstack: 'Succeeded' });
  assert.equal(report.azureHealthStatusBeforeUpdate, 200);
  assert.deepEqual(report.azureFunctionDiscovery, { status200WithoutUploadRoute: 2, status401: 19,
    uploadRouteDiscovered: false });
  assert.equal(report.terminalError, 'azure upload diagnostic did not become available');
  assert.equal(report.blobUploadAttempted, false);
  assert.equal(report.eventDeliveryCompared, false);
  assert.equal(report.componentChecksPassed, false);
  assert.equal(report.fullDocumentWorkflowCompleted, false);
  assert.deepEqual(report.automaticCleanup, { resourcesAbsent: true, groupEmpty: true, localCleanupComplete: true });
  assert.deepEqual(report.independentAzureReadback, { resources: 0, deploymentRecords: 0 });
  assert.equal(report.budget.actualAzureSpendMeasured, false);
});

test('paired Blob upload evidence preserves the event-delivery and full-workflow limits', async () => {
  const report = await load('document-upload-azure-9a3a78a/summary.json');
  assert.equal(report.sourceRevision, '9a3a78a111cebbd3557806c58f54d913d7637644');
  assert.equal(report.sourceDirty, false);
  assert.deepEqual(report.blobUpload.azure.status, 201);
  assert.deepEqual(report.blobUpload.local.status, 201);
  assert.equal(report.blobUpload.azure.inputSha256, report.blobUpload.local.inputSha256);
  assert.equal(report.localEventGrid.nativeFunctionDeliveryAttempted, true);
  assert.equal(report.localEventGrid.deliveryFailureReason, 'NativeEventGridHttp500');
  assert.equal(report.azureEventGrid.deliveryObserved, false);
  assert.equal(report.componentChecksPassed, true);
  assert.equal(report.fullDocumentWorkflowCompleted, false);
  assert.equal(report.portalEvidenceComplete, false);
  assert.deepEqual(report.independentAzureReadback, { resources: 0, deploymentRecords: 0 });
  assert.equal(report.budget.actualAzureSpendMeasured, false);
});

test('local event diagnostic evidence requires a delivered native marker and preserves the production failure', async () => {
  const report = await load('document-event-diagnostic-b64dcfd/summary.json');
  assert.equal(report.sourceRevision, 'b64dcfd41f1ed9928307a44c24f11c84aa5f89d3');
  assert.equal(report.sourceDirty, false);
  assert.equal(report.target, 'GlobalStack only');
  assert.equal(report.templateSha256.data, 'ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e');
  assert.equal(report.templateSha256.events, 'd5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09');
  assert.equal(report.uploadStatus, 201);
  assert.equal(report.eventMarker.status, 200);
  assert.ok(report.eventDelivery.some(item => item.subscription === 'document-diagnostic' && item.state === 'delivered'));
  assert.ok(report.eventDelivery.some(item => item.subscription === 'document-revisions' && item.reason === 'NativeEventGridHttp500'));
  assert.equal(report.azureCompared, false);
  assert.equal(report.fullDocumentWorkflowCompleted, false);
  assert.equal(report.localCleanupComplete, true);
});

test('paired event diagnostic evidence separates marker delivery from the incomplete workflow', async () => {
  const report = await load('document-event-paired-a21fb51/summary.json');
  assert.equal(report.sourceRevision, 'a21fb51173252003e51e7addf85a3e5d761b9c53');
  assert.equal(report.sourceDirty, false);
  assert.deepEqual(report.targets, ['Azure', 'GlobalStack']);
  assert.equal(report.templateSha256['document-data'], 'ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e');
  assert.equal(report.templateSha256['document-events'], 'd5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09');
  assert.equal(report.blobUpload.azure.status, 201);
  assert.equal(report.blobUpload.local.status, 201);
  assert.equal(report.diagnosticMarker.azure.status, 200);
  assert.equal(report.diagnosticMarker.local.status, 200);
  assert.equal(report.azureSystemTopicMetricTotals.aggregatesSubscriptions, true);
  assert.equal(report.azureSystemTopicMetricTotals.DeliverySuccessCount, 1);
  assert.equal(report.azureSystemTopicMetricTotals.DeliveryAttemptFailCount, 1);
  assert.ok(report.globalstackEventDelivery.some(item => item.subscription === 'document-diagnostic' && item.state === 'delivered'));
  assert.ok(report.globalstackEventDelivery.some(item => item.subscription === 'document-revisions' && item.reason === 'NativeEventGridHttp500'));
  assert.equal(report.fullDocumentWorkflowCompleted, false);
  assert.equal(report.runnerFinalResultWritten, false);
  assert.deepEqual(report.independentAzureReadback, { resources: 0, deploymentRecords: 0 });
  assert.equal(report.cleanupReconciledManually, true);
  assert.equal(report.budget.actualAzureSpendMeasured, false);
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

test('scoped hosting retains Azure throttling and verifies individual resource cleanup', async () => {
  const prefix = 'scoped-hosting-throttled-8b3eece/';
  const index = await load(prefix + 'index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(prefix + 'result.json');
  assert.equal(report.sourceDirty, false); assert.match(report.error, /throttled/);
  assert.deepEqual(report.cleanup, { plansAbsent: true, deploymentAbsent: true, groupPreserved: true });
  assert.ok(report.exchanges.some(item => item.target === 'azure' && item.phase === 'provider-validation' && item.status === 200));
  const failures = report.exchanges.flatMap(item => item.target === 'azure' ? item.body?.value ?? [] : []).filter(item => item.properties?.statusCode === 429);
  assert.equal(new Set(failures.map(item => item.properties.targetResource.id)).size, 2);
  assert.ok(!report.exchanges.some(item => item.target === 'azure' && item.method === 'DELETE' && /\/resourceGroups\/<group>\?/.test(item.path)));
});

test('native Search SDK evidence retains write, read-only and revoked phases', async () => {
  const prefix = 'functions-native-search-efc981d/';
  const index = await load(prefix + 'index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(prefix + 'result.json');
  assert.equal(report.sourceRevision, index.sourceRevision); assert.equal(report.sourceDirty, false);
  assert.equal(report.cleanup, true); assert.equal(report.error, undefined); assert.equal(report.businessWorkflowCompleted, false);
  const search = report.nativeIdentity.search;
  assert.deepEqual(search.checks, [{ phase: 'authorized', queryAllowed: true, writesAllowed: true },
    { phase: 'reader', queryAllowed: true, writesAllowed: false }, { phase: 'none', queryAllowed: false, writesAllowed: false }]);
  assert.deepEqual(search.requests.map(item => item.status), [201, 200, 200, 403, 403, 200, 403, 403, 403]);
  assert.ok(search.requests.every(item => item.bearer));
  assert.equal(report.nativeIdentity.database.cleanup, true);
});

test('successful scoped hosting retry retains rejection parity and cleanup', async () => {
  const prefix = 'scoped-hosting-success-c135f08/';
  const index = await load(prefix + 'index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(prefix + 'result.json');
  assert.equal(report.revision, index.sourceRevision);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.observationsComplete, true);
  assert.equal(report.error, undefined);
  assert.equal(report.fullProtocolParityEvaluated, false);
  assert.deepEqual(report.cleanup, { plansAbsent: true, deploymentAbsent: true, groupPreserved: true });
  for (const sku of ['P0v3', 'EP1']) {
    const exchanges = (phase) => report.exchanges.filter(item => item.phase === `${sku}-${phase}`);
    for (const phase of ['read', 'unchanged-put', 'tag-update', 'read-after-rejection']) {
      assert.deepEqual(exchanges(phase).map(item => [item.target, item.status]), [['azure', 200], ['local', 200]]);
    }
    const rejected = exchanges('invalid-sku');
    assert.deepEqual(rejected.map(item => [item.target, item.status]), [['azure', 400], ['local', 400]]);
    assert.deepEqual(rejected[0].body, rejected[1].body);
    for (const item of exchanges('read-after-rejection')) {
      assert.equal(item.body.sku.name, sku);
      assert.equal(item.body.tags.purpose, 'lifecycle-update');
    }
  }
});

test('workload permission evidence stops before deployment or paid allocation', async () => {
  const prefix = 'workload-permissions-1802d8a/';
  const index = await load(prefix + 'index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(prefix + 'result.json');
  assert.equal(report.revision, index.sourceRevision);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.cloudResourcesProvisioned, false);
  assert.equal(report.resourceCountBefore, 0);
  assert.equal(report.workloadRolePermissions.status, 'missing-permission');
  assert.equal(report.workloadRolePermissions.actions.length, 2);
  assert.ok(report.workloadRolePermissions.actions.every(item => item.listedGrant === false));
  assert.match(report.error, /do not provision the full stack/);
  assert.ok(report.exchanges.every(item => item.target === 'azure' && item.method === 'GET' && item.status === 200));
});

test('paired workload role catalog retains six original gaps and 13 clean reruns', async () => {
  const prefix = 'workload-role-catalog/';
  const index = await load(prefix + 'index.json');
  assert.equal(index.attempts.length, 26);
  assert.equal(index.attempts.filter(item => item.phase === 'before' && !item.passed).length, 6);
  assert.equal(new Set(index.attempts.map(item => item.role)).size, 13);
  for (const attempt of index.attempts) {
    const metadata = index.files[attempt.file];
    const bytes = await readFile(new URL(prefix + attempt.file, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
    const report = JSON.parse(bytes);
    assert.equal(report.revision, attempt.revision);
    assert.equal(report.sourceDirty, false);
    assert.equal(report.cleanup, true);
    assert.equal(report.businessWorkflowCompleted, false);
    const azure = report.exchanges.filter(item => item.target === 'azure');
    assert.ok(azure.some(item => item.method === 'PUT' && item.status === 201));
    assert.equal(azure.at(-2).method, 'DELETE'); assert.equal(azure.at(-2).status, 200);
    assert.equal(azure.at(-1).method, 'GET'); assert.equal(azure.at(-1).status, 404);
    if (attempt.phase === 'after') {
      assert.equal(report.error, undefined);
      assert.equal(report.assignmentRoundTrip, true);
      const local = report.exchanges.filter(item => item.target === 'local');
      assert.deepEqual(local.map(item => [item.method, item.status]), [['PUT', 201], ['GET', 200], ['DELETE', 200]]);
    }
  }
});

test('foundation evidence retains the false success and cleanup independently of later fixes', async () => {
  const prefix = 'document-foundation-before-c85eeea/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(`${prefix}result.json`);
  assert.equal(report.revision, index.sourceRevision);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.localDeploymentState, 'Succeeded');
  assert.deepEqual(report.comparisons.map(item => item.localStatus), [404, 404, 404, 200]);
  assert.ok(report.comparisons.every(item => item.azureStatus === 200));
  assert.deepEqual(report.cleanup, { resourcesAbsent: true, deploymentAbsent: true, groupPreserved: true });
  assert.equal(report.businessWorkflowCompleted, false);
});

test('deployed document worker evidence distinguishes native Azure health from missing local execution', async () => {
  const prefix = 'document-worker-runtime-0c09247/';
  const index = await load(prefix + 'index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = await load(prefix + 'result.json');
  assert.equal(report.revision, index.sourceRevision);
  assert.equal(report.azureNativeHealth, true);
  assert.equal(report.hostLocalState, 'Succeeded'); assert.equal(report.appLocalState, 'Succeeded');
  assert.equal(report.localHealthStatus, 404);
  assert.equal(report.localNativeRuntimeVerified, false); assert.equal(report.businessWorkflowCompleted, false);
  assert.match(report.applicationImage.digest, /@sha256:[a-f0-9]{64}$/);
  const observed = report.exchanges.filter(item => item.phase === 'native-health');
  assert.ok(observed.some(item => item.target === 'azure' && item.status === 200 && item.body?.worker === 'ready'));
  assert.ok(observed.some(item => item.target === 'local' && item.body?.error?.code === 'FunctionNotFound'));
  assert.deepEqual(report.cleanup, { resourcesAbsent: true, rolesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
});
