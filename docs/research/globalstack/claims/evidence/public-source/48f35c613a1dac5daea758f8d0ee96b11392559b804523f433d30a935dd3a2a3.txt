import { isDeepStrictEqual } from 'node:util';

export function claimsOutcome({ event, expectedRecord, deliveries, messages, ledger }) {
  const expectedEntity = { PartitionKey: 'claims', RowKey: event.id, ...expectedRecord, status: 'queued' };
  const entityMatches = ledger.status === 200 && Object.entries(expectedEntity).every(([k, v]) => isDeepStrictEqual(ledger.body[k], v));
  return deliveries.length === 1 && deliveries[0].path === '/claims'
    && isDeepStrictEqual(deliveries[0].body, [event])
    && messages.length === 1 && isDeepStrictEqual(messages[0], expectedRecord) && entityMatches;
}
