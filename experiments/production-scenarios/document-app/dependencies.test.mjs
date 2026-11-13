import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { GuidManager } = require('durable-functions/lib/src/util/GuidManager.js');

test('patched UUID dependency preserves Durable deterministic replay identifiers', () => {
  // Captured with Durable 3.6.0 and its original UUID dependency before the
  // security update. Replay identifiers must not change across this override.
  const cases = [
    ['instance-a:0', '2f5a4e7b-d77f-5b34-9a34-c7f1d9cc5717'],
    ['instance-a:1', 'f5d4b26f-9a15-5e59-b1f6-4b524353c94b'],
    ['instance-b:0', '803d26ec-3230-54b7-81bf-c0fea01b4ce8'],
  ];
  for (const [name, expected] of cases) assert.equal(GuidManager.createDeterministicGuid(GuidManager.DnsNamespaceValue, name), expected);
});
