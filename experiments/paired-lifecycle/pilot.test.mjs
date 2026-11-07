import assert from 'node:assert/strict';
import test from 'node:test';
import { permitted, sanitize, startObserver } from './transport.mjs';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeOwnedGroup } from './cleanup.mjs';
import { compare } from './compare.mjs';
import { gzipSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const subscription = '00000000-0000-0000-0000-000000000000';
const group = 'gs-pair-123456789abc';
const path = `/subscriptions/${subscription}/resourcegroups/${group}`;

test('observer permits only the declared group writes and read-only operation polling', () => {
  assert.equal(permitted('PUT', `${path}?api-version=2021-04-01`, path), true);
  for (const route of [`${path}/providers/Microsoft.Compute/virtualMachines/one`, `${path}-other`, '/subscriptions/other/resourcegroups/one', 'https://example.org' + path]) {
    assert.equal(permitted('PUT', route, path), false);
  }
  const poll = `/subscriptions/${subscription}/providers/Microsoft.Resources/locations/eastus/operations/one`;
  assert.equal(permitted('GET', poll, path), false);
  assert.equal(permitted('GET', poll, path, new Set([poll])), true);
  assert.equal(permitted('DELETE', poll, path), false);
  assert.equal(permitted('POST', path, path), false);
});

test('sanitization retains business key fields and removes explicit credentials and identifiers', () => {
  const fixture = { RowKey: 'business-id', keyName: 'label', accessToken: 'private', path: `${path}/private-token` };
  const result = sanitize(fixture, [['private-token', '<redacted>'], [subscription, '<subscription>']]);
  assert.equal(result.RowKey, fixture.RowKey); assert.equal(result.keyName, fixture.keyName);
  assert.equal(result.accessToken, '<redacted>');
  assert.ok(!JSON.stringify(result).includes('private-token'));
  assert.ok(!JSON.stringify(result).includes(subscription));
  const signed = sanitize(`https://management.azure.com${path}/operationresults/opaque-id?api-version=2025-04-01&s=private-signature&c=certificate&t=123&h=private-hash`);
  assert.ok(!signed.includes('private-signature')); assert.ok(!signed.includes('opaque-id')); assert.ok(signed.includes('api-version=2025-04-01'));
});

test('cleanup refuses ownership mismatch and unexpected child resources', async t => {
  const manifest = { subscription, group, runId: 'run', token: 'synthetic' };
  const calls = [];
  let mode = 'owner';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.method);
    const body = String(url).includes('/resources?') ? { value: [{ id: 'unexpected' }] } : { tags: { run: mode === 'owner' ? 'someone-else' : 'run', project: 'globalstack-paired-lifecycle' } };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  await assert.rejects(removeOwnedGroup(manifest), /ownership mismatch/);
  mode = 'children'; await assert.rejects(removeOwnedGroup(manifest), /unexpectedly contains resources/);
  assert.ok(!calls.includes('DELETE'));
});

test('cleanup does not delete a group already absent', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => { calls.push(options.method); return new Response('{}', { status: 404 }); });
  assert.deepEqual(await removeOwnedGroup({ subscription, group, runId: 'run', token: 'synthetic' }), { absent: true, fallbackDelete: false });
  assert.deepEqual(calls, ['GET']);
});

test('comparison retains semantic differences, missing exchanges and failed lifecycle evidence', () => {
  const trace = { phase: 'create', method: 'PUT', path: '/group', request: { body: {} }, status: 201, response: { body: { properties: { provisioningState: 'Succeeded' } }, headers: {} } };
  const local = { name: 'local', ok: true, sourceUnchanged: true, source: { file: 'hash' }, phases: [], traces: [trace] };
  const azure = structuredClone({ ...local, name: 'azure' });
  azure.traces[0].response.body.properties.provisioningState = 'Failed';
  azure.traces.push({ ...trace, method: 'GET' });
  const result = compare({ schemaVersion: 1, targets: [local, azure] });
  assert.equal(result.exchangesWithDifferences, 1); assert.equal(result.unmatchedExchanges, 1);
  assert.ok(result.exchanges[0].differences.some(item => item.path === '/response/body/properties/provisioningState'));
  azure.ok = false;
  assert.equal(compare({ schemaVersion: 1, targets: [local, azure] }).completePilot, false);
  azure.source.file = 'modified'; assert.throws(() => compare({ schemaVersion: 1, targets: [local, azure] }), /Source hashes differ/);
});

test('TLS observer forwards native response bytes unchanged and excludes bearer material', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'paired-transport-'));
  const cert = join(directory, 'cert.pem'), key = join(directory, 'key.pem');
  const raw = '{"properties":{"provisioningState":"Succeeded"},"tags":{"revision":"two"}}';
  const polling = `/subscriptions/${subscription}/operationresults/opaque-job?api-version=2021-04-01&s=synthetic-signature`;
  const incoming = [], traces = [];
  const expanded = JSON.stringify({ value: 'x'.repeat(1048576) });
  const compressed = { gzip: gzipSync(expanded), deflate: deflateSync(expanded) };
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    incoming.push({ method: req.method, path: req.url, body, host: req.headers.host, protocol: req.headers['x-forwarded-proto'] });
    if (req.method === 'DELETE') { res.writeHead(202, { location: `https://management.azure.com${polling}` }).end(); return; }
    if (req.url === polling) { res.writeHead(204).end(); return; }
    const encoding = new URL(req.url, 'https://management.azure.com').searchParams.get('encoding');
    if (compressed[encoding]) { res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': encoding }).end(compressed[encoding]); return; }
    res.writeHead(201, { 'content-type': 'application/json', 'retry-after': '3' }).end(raw);
  });
  let observer;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=management.azure.com', '-addext', 'subjectAltName=DNS:management.azure.com'], { stdio: 'ignore' });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    observer = await startObserver({ targetOrigin: `http://127.0.0.1:${server.address().port}`, groupPath: path, cert: await readFile(cert), key: await readFile(key), replacements: [], phase: () => 'test', record: row => traces.push(row) });
    const call = (endpoint, method = 'PUT') => new Promise((resolve, reject) => {
      const child = spawn('curl', ['--silent', '--show-error', '--max-time', '10', '--noproxy', '', '--proxy', observer.url, '--cacert', cert, '-X', method, '-H', 'Authorization: Bearer synthetic-private-marker', '-H', 'Content-Type: application/json', ...(method === 'PUT' ? ['--data', '{"tags":{"revision":"two"}}'] : []), `https://management.azure.com${endpoint}`]);
      let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr)));
    });
    assert.equal(await call(path + '?api-version=2021-04-01'), raw);
    assert.equal(incoming.length, 1); assert.equal(incoming[0].method, 'PUT');
    assert.equal(incoming[0].host, 'management.azure.com'); assert.equal(incoming[0].protocol, 'https');
    assert.equal(traces[0].status, 201); assert.equal(traces[0].response.headers['retry-after'], '3');
    assert.ok(!JSON.stringify(traces).includes('synthetic-private-marker'));
    const denied = JSON.parse(await call(path + '/providers/Microsoft.Compute/virtualMachines/one'));
    assert.equal(denied.error.code, 'ObserverScopeDenied'); assert.equal(incoming.length, 1);
    assert.equal(JSON.parse(await call(polling, 'GET')).error.code, 'ObserverScopeDenied');
    await call(path, 'DELETE');
    await call(polling, 'GET');
    assert.equal(incoming.at(-1).path, polling); assert.equal(traces.at(-1).status, 204);
    assert.ok(!JSON.stringify(traces).includes('synthetic-signature'));
    for (const encoding of ['gzip', 'deflate']) {
      await call(`${path}?encoding=${encoding}`, 'GET');
      assert.deepEqual(traces.at(-1).response.body, { unparsedBytes: compressed[encoding].length, sha256: createHash('sha256').update(compressed[encoding]).digest('hex') });
      assert.equal(traces.at(-1).transportError, undefined);
    }
  } finally {
    if (observer) await observer.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('aggregate success cannot hide missing capture, failed cleanup or an incorrect native exit code', async () => {
  const original = JSON.parse(await readFile(new URL('./evidence/corrected.json', import.meta.url), 'utf8'));
  assert.equal(compare(original).completePilot, true);
  for (const alter of [
    report => { report.targets[0].traces = []; },
    report => { report.targets[1].cleanup.absent = false; },
    report => { report.targets[1].phases.find(phase => phase.phase === 'plan-drift').exitCode = 0; },
  ]) {
    const changed = structuredClone(original); alter(changed);
    assert.equal(compare(changed).completePilot, false);
  }
});
