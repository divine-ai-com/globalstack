import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { CleanupStack } from '../../src/conformance/cleanup-stack.mjs';
import { CaptureWriter } from '../../src/conformance/capture-writer.mjs';
import { createResourceName, normalizeLabelValue } from '../../src/conformance/run-context.mjs';
import { sanitizeExchange } from '../../src/conformance/sanitizer.mjs';

test('resource names and labels are normalized for GCP constraints', () => {
  assert.equal(normalizeLabelValue('Run.ID/With Spaces'), 'run-id-with-spaces');
  const name = createResourceName({
    prefix: 'gst-capture',
    runId: 'Cloud Storage 20260528 ABCDEF',
    maxLength: 32,
  });
  assert.match(name, /^gst-capture-cloud-storage-/);
  assert.ok(name.length <= 32);
});

test('cleanup stack runs in reverse order and records failures', async () => {
  const calls = [];
  const cleanup = new CleanupStack();
  cleanup.push('first', async () => calls.push('first'));
  cleanup.push('second', async () => {
    calls.push('second');
    throw new Error('delete failed');
  });

  const results = await cleanup.run();

  assert.deepEqual(calls, ['second', 'first']);
  assert.deepEqual(results.map(result => result.status), ['failed', 'deleted']);
});

test('sanitizer redacts credentials and dynamic Google response ids', () => {
  const sanitized = sanitizeExchange({
    request: {
      headers: {
        authorization: 'Bearer secret',
      },
    },
    response: {
      headers: {
        date: 'Thu, 28 May 2026 00:00:00 GMT',
        'x-goog-request-id': 'request-id',
      },
      body: {
        id: 'dynamic-id',
        mediaLink: 'https://storage.googleapis.com/download/storage/v1/b/example/o/object?generation=1',
        name: 'stable-name',
        projectNumber: '123456789',
        generation: '123',
        publishTime: '2026-05-28T18:33:25.350Z',
        expireTime: '2026-06-04T18:33:25.206Z',
      },
    },
  });

  assert.equal(sanitized.request.headers.authorization, '<redacted>');
  assert.equal(sanitized.response.headers.date, '<redacted>');
  assert.equal(sanitized.response.headers['x-goog-request-id'], '<redacted>');
  assert.equal(sanitized.response.body.id, '<redacted>');
  assert.equal(sanitized.response.body.mediaLink, '<redacted>');
  assert.equal(sanitized.response.body.projectNumber, '<redacted>');
  assert.equal(sanitized.response.body.publishTime, '<redacted>');
  assert.equal(sanitized.response.body.expireTime, '<redacted>');
  assert.equal(sanitized.response.body.name, 'stable-name');
});

test('capture writer persists sanitized capture files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-capture-'));
  try {
    const writer = new CaptureWriter({
      root: pathToFileURL(`${dir}/`),
      service: 'cloud-storage',
      runId: 'run-1',
    });
    writer.record('example', {
      request: {
        method: 'GET',
        url: 'https://storage.googleapis.com/storage/v1/b/example',
        headers: {
          authorization: 'Bearer secret',
        },
      },
      response: {
        status: 200,
        headers: {},
        body: {
          name: 'example',
        },
      },
    });

    const path = await writer.write({
      context: { run_id: 'run-1' },
      cleanup: [],
      status: 'passed',
    });
    const capture = JSON.parse(await readFile(path, 'utf8'));

    assert.equal(capture.status, 'passed');
    assert.equal(capture.events[0].exchange.request.headers.authorization, '<redacted>');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
