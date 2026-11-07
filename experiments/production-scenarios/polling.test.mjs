import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validationPollPath } from './polling.mjs';

test('validation polling cannot send credentials to another host, subscription or resource operation', () => {
  const valid = '/subscriptions/test/providers/Microsoft.Resources/locations/eastus2/operationStatuses/example?api-version=2025-04-01';
  assert.equal(validationPollPath(valid, 'test'), valid);
  const subscriptionOperation = '/subscriptions/test/operationresults/example?api-version=2025-04-01';
  assert.equal(validationPollPath(subscriptionOperation, 'test'), subscriptionOperation);
  for (const invalid of [
    `https://untrusted.invalid${valid}`,
    `https://user@management.azure.com${valid}`,
    valid.replace('/test/', '/other/'),
    '/subscriptions/test/resourceGroups/an-unrelated-group',
    valid.replace('Microsoft.Resources', 'Microsoft.Compute'),
  ]) assert.throws(() => validationPollPath(invalid, 'test'));
});
