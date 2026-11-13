import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:https';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createSearchRouter } from '../../packages/azure-data-plane/src/search-router.mjs';
import { searchRoles } from '../../packages/azure-data-plane/src/search-token-auth.mjs';
const exec = promisify(execFile);

export async function prepareSearchProbe({ store, trust, arm, listen, suffix, gateway, directory, certificateBundle, group, principalId }) {
  const serviceName = `gs-search-${suffix}`, host = `${serviceName}.search.windows.net`;
  const serviceId = `${group}/providers/Microsoft.Search/searchServices/${serviceName}`;
  const sub = group.split('/')[2];
  await arm('PUT', serviceId, { location: 'westus2', sku: { name: 'basic' },
    properties: { replicaCount: 1, partitionCount: 1, disableLocalAuth: true } }, '2025-05-01');
  const router = createSearchRouter({ store, tokenTrusts: [trust] });
  router.registerService({ serviceName, resourceId: serviceId });
  const report = { scope: 'Native image Search SDK using signed local workload identity and verified TLS. No Azure Search or full application comparison.', requests: [], checks: [] };
  const key = resolve(directory, 'search.key'), cert = resolve(directory, 'search.pem');
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`]);
  await appendFile(certificateBundle, await readFile(cert));
  const handler = router.handler();
  const port = await listen(createServer({ key: await readFile(key), cert: await readFile(cert) }, (req, res) => {
    res.once('finish', () => report.requests.push({ method: req.method, path: new URL(req.url, 'https://localhost').pathname,
      bearer: /^Bearer /.test(req.headers.authorization ?? ''), status: res.statusCode }));
    Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  }));
  let roleCounter = 0;
  async function role(kind) {
    const id = `${serviceId}/providers/Microsoft.Authorization/roleAssignments/33333333-3333-4333-8333-${String(++roleCounter).padStart(12, '0')}`;
    await arm('PUT', id, { properties: { principalId,
      roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${searchRoles[kind]}` } }, '2022-04-01'); return id;
  }
  const admin = await role('service'), writer = await role('writer');
  const script = `
    import assert from 'node:assert/strict';
    import { DefaultAzureCredential } from '@azure/identity';
    import { SearchClient, SearchIndexClient } from '@azure/search-documents';
    const credential = new DefaultAzureCredential();
    const options = { serviceVersion: '2024-07-01', retryOptions: { maxRetries: 0 } };
    const index = new SearchIndexClient(process.env.SEARCH_ENDPOINT, credential, options);
    const client = new SearchClient(process.env.SEARCH_ENDPOINT, 'documents', credential, options);
    const phase = process.argv[1];
    if (phase === 'authorized') {
      await index.createOrUpdateIndex({ name: 'documents', fields: [{ name: 'id', type: 'Edm.String', key: true }, { name: 'content', type: 'Edm.String', searchable: true }] });
      const result = await client.uploadDocuments([{ id: 'doc-1', content: 'verified document text' }]);
      assert.equal(result.results[0].succeeded, true);
    } else {
      await assert.rejects(client.uploadDocuments([{ id: 'denied', content: 'must not be written' }]), { statusCode: 403 });
      await assert.rejects(index.deleteIndex('documents'), { statusCode: 403 });
    }
    if (phase === 'none') await assert.rejects(client.search('*'), { statusCode: 403 });
    else {
      const result = await client.search('*'), rows = [];
      for await (const item of result.results) rows.push(item.document);
      assert.equal(rows.length, 1); assert.equal(rows[0].id, 'doc-1');
    }
    console.log(JSON.stringify({ phase, queryAllowed: phase !== 'none', writesAllowed: phase === 'authorized' }));
  `;
  return { report, dockerArgs: ['--add-host', `${host}:${gateway}`], async exercise(container) {
    let reader;
    for (const phase of ['authorized', 'reader', 'none']) {
      if (phase === 'reader') {
        for (const id of [admin, writer]) await arm('DELETE', id, undefined, '2022-04-01');
        reader = await role('reader');
      }
      if (phase === 'none') await arm('DELETE', reader, undefined, '2022-04-01');
      let stdout;
      try {
        ({ stdout } = await exec('docker', ['exec', '-w', '/home/site/wwwroot', '-e', `SEARCH_ENDPOINT=https://${host}:${port}`, container,
          'node', '--input-type=module', '-e', script, phase], { timeout: 45000, maxBuffer: 65536 }));
      } catch { throw new Error(`Native Search SDK diagnostic failed during ${phase}; raw SDK diagnostics were not retained`); }
      report.checks.push(JSON.parse(stdout.trim()));
    }
    assert.ok(report.requests.length && report.requests.every(item => item.bearer));
  } };
}
