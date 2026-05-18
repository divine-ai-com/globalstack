import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const expectationsPath = new URL('../../../fixtures/local-expectations/azure-storage-data-plane-expectations.json', import.meta.url);

function byCase(expectations) {
  return new Map(expectations.map(item => [item.caseId, item]));
}

test('Azure Storage data-plane expectations are rendered from cleanup-verified live captures', async () => {
  const doc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  assert.equal(doc.source, 'fixtures/azure-storage-data-plane-captures');
  assert.equal(doc.expectationCount, doc.expectations.length);
  assert.equal(doc.expectationCount, 32);
  assert.ok(doc.caveat.includes('not all locally replayable'));

  const wave = doc.fixtureSummaries.find(item => item.id === 'storage-data-plane-blob-queue-wave-1');
  assert.ok(wave);
  assert.equal(wave.cleanupVerified, true);
  assert.equal(wave.caseCount, 32);
  assert.equal(wave.mismatchCount, 4);
});

test('Azure Storage data-plane expectations preserve real Azure statuses and error codes', async () => {
  const doc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  const cases = byCase(doc.expectations);

  const expected = {
    'blob-invalid-container-uppercase': [400, 'InvalidResourceName'],
    'blob-invalid-container-too-short': [400, 'OutOfRangeInput'],
    'blob-duplicate-container-create': [409, 'ContainerAlreadyExists'],
    'blob-missing-blob': [404, 'BlobNotFound'],
    'blob-missing-container': [404, 'ContainerNotFound'],
    'blob-missing-blob-type-header': [400, 'MissingRequiredHeader'],
    'blob-get-without-authorization': [401, 'NoAuthenticationInformation'],
    'blob-get-after-delete': [404, 'BlobNotFound'],
    'queue-invalid-uppercase': [400, 'InvalidResourceName'],
    'queue-invalid-too-short': [400, 'OutOfRangeInput'],
    'queue-duplicate-create': [204, null],
    'queue-missing-metadata': [404, 'QueueNotFound'],
    'queue-malformed-message': [400, 'InvalidXmlDocument'],
    'queue-peek-after-delete': [200, null],
  };

  for (const [caseId, [status, errorCode]] of Object.entries(expected)) {
    const item = cases.get(caseId);
    assert.ok(item, `missing case ${caseId}`);
    assert.equal(item.expected.status, status, `${caseId} status`);
    assert.equal(item.expected.errorCode, errorCode, `${caseId} error code`);
  }
});

test('Azure Storage data-plane expectations keep Azurite mismatches explicit', async () => {
  const doc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  const cases = byCase(doc.expectations);

  const statusMatchErrorGaps = [
    'blob-missing-blob-type-header',
    'queue-malformed-message',
  ];
  for (const caseId of statusMatchErrorGaps) {
    const item = cases.get(caseId);
    assert.equal(item.localSupportState, 'azurite-status-match-error-code-gap', caseId);
    assert.equal(item.azurite.matchesStatus, true, caseId);
    assert.equal(item.azurite.matchesErrorCode, false, caseId);
  }

  const behaviorGaps = [
    'blob-get-without-authorization',
    'queue-peek-after-delete',
  ];
  for (const caseId of behaviorGaps) {
    const item = cases.get(caseId);
    assert.equal(item.localSupportState, 'azurite-behavior-gap', caseId);
    assert.equal(item.azurite.matchesStatus, false, caseId);
    assert.equal(item.azurite.matchesErrorCode, false, caseId);
  }

  assert.ok([...cases.values()].some(item => item.localSupportState === 'azurite-matches-azure'));
});

test('Azure Storage data-plane expectations mark only captured safe mismatches as locally normalizable', async () => {
  const doc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  const cases = byCase(doc.expectations);

  for (const caseId of [
    'blob-missing-blob-type-header',
    'blob-get-without-authorization',
    'queue-malformed-message',
  ]) {
    const item = cases.get(caseId);
    assert.equal(item.globalstackNormalization?.status, 'implemented', caseId);
    assert.equal(item.globalstackNormalization.sourceFixture, 'fixtures/azure-storage-data-plane-captures/storage-data-plane-blob-queue-wave-1.json');
    assert.equal(item.globalstackNormalization.azureStatus, item.expected.status);
    assert.equal(item.globalstackNormalization.azureErrorCode, item.expected.errorCode);
  }

  const postDelete = cases.get('queue-peek-after-delete');
  assert.equal(postDelete.globalstackNormalization?.status, 'needs-repeat-capture');
  assert.equal(postDelete.expected.status, 200);
  assert.equal(postDelete.azurite.status, 404);
});
