import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimsOutcome } from './terraform/test/claims-outcome.mjs';

test('claims outcome requires the event, queue record and ledger together', () => {
  const event = { id: 'case-1', data: { blobName: 'case-1.json' } };
  const expectedRecord = { correlationId: 'case-1', claimId: 'CLAIM-001', blobName: 'case-1.json', sha256: 'expected-hash' };
  const good = { event, expectedRecord, deliveries: [{ path: '/claims', body: [structuredClone(event)] }],
    messages: [structuredClone(expectedRecord)], ledger: { status: 200, body: { PartitionKey: 'claims', RowKey: 'case-1', ...expectedRecord, status: 'queued' } } };
  assert.equal(claimsOutcome(good), true);
  for (const mutate of [
    d => { d.deliveries = []; },
    d => { d.deliveries[0].path = '/wrong'; },
    d => { d.deliveries.push(structuredClone(d.deliveries[0])); },
    d => { d.messages.push(structuredClone(d.messages[0])); },
    d => { d.messages[0].sha256 = 'wrong'; },
    d => { d.ledger.body.status = 'incomplete'; },
    d => { d.ledger.body.RowKey = 'other'; },
    d => { d.ledger.status = 404; },
  ]) {
    const bad = structuredClone(good); mutate(bad); assert.equal(claimsOutcome(bad), false);
  }
});

test('the integration entry point cannot fall back to management-only checks', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [new URL('./terraform/test/claims-behavior.int.test.mjs', import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLAIMS_CONTEXT_PATH is required/);
});

test('observation redirects cannot send the local test to another endpoint', async () => {
  const { createServer } = await import('node:http');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  let redirected = 0;
  const target = createServer((_req, res) => { redirected++; res.end('{}'); });
  await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
  const receiver = createServer((_req, res) => res.writeHead(302, { location: `http://127.0.0.1:${target.address().port}/outside` }).end());
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve));
  const directory = await mkdtemp(join(tmpdir(), 'claims-context-'));
  try {
    const endpoint = `http://127.0.0.1:${receiver.address().port}`;
    const path = join(directory, 'context.json');
    await writeFile(path, JSON.stringify({ account: { name: 'test', key: 'dGVzdA==' }, names: {},
      storageClientModule: fileURLToPath(new URL('../../packages/azure-data-plane/src/azurite-client.mjs', import.meta.url)),
      endpoints: { blob: endpoint, queue: endpoint, table: endpoint, event: endpoint, observations: endpoint + '/_observations' },
    }));
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./terraform/test/claims-behavior.int.test.mjs', import.meta.url))], {
        env: { PATH: process.env.PATH, CLAIMS_CONTEXT_PATH: path }, stdio: 'ignore',
      });
      child.once('error', reject); child.once('close', resolve);
    });
    assert.notEqual(code, 0);
    assert.equal(redirected, 0);
  } finally {
    for (const server of [receiver, target]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(directory, { recursive: true, force: true });
  }
});
