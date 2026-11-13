import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:https';
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createKeyVaultRouter } from '../../packages/azure-data-plane/src/key-vault-router.mjs';
import { keyVaultSecretsUserRole } from '../../packages/azure-data-plane/src/key-vault-token-auth.mjs';

const exec = promisify(execFile);

export async function prepareDatabaseProbe({ store, trust, arm, listen, name, suffix, gateway, directory,
  certificateBundle, group, principalId, registerCleanup, secrets }) {
  const sub = '00000000-0000-0000-0000-000000000000', vaultName = `kv${suffix}`;
  const vaultId = `${group}/providers/Microsoft.KeyVault/vaults/${vaultName}`;
  const databaseName = `${name}-sql`, databaseHost = `${vaultName}.postgres.database.azure.com`;
  const password = randomBytes(24).toString('hex'); secrets.push(password);
  const report = { scope: 'Application Key Vault secret lookup and native PostgreSQL TLS fixture. No Azure database or ARM database lifecycle comparison.',
    vaultRequests: [], checks: [], cleanup: false };
  let databaseCreated = false;
  registerCleanup(async () => {
    if (databaseCreated) await exec('docker', ['rm', '-f', databaseName]);
    report.cleanup = true;
  });
  async function certificate(host, prefix) {
    const key = resolve(directory, `${prefix}.key`), cert = resolve(directory, `${prefix}.pem`);
    await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert,
      '-days', '1', '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`]);
    await appendFile(certificateBundle, await readFile(cert));
    return { key, cert };
  }
  const vaultTls = await certificate(`${vaultName}.vault.azure.net`, 'vault');
  const sqlTls = await certificate(databaseHost, 'postgres');
  await arm('PUT', vaultId, { location: 'westus2', properties: { tenantId: sub,
    sku: { family: 'A', name: 'standard' }, enableRbacAuthorization: true } }, '2023-07-01');
  await arm('PUT', `${vaultId}/secrets/database-password`, { properties: { value: password } }, '2023-07-01');
  const roleId = `${vaultId}/secrets/database-password/providers/Microsoft.Authorization/roleAssignments/22222222-2222-4222-8222-222222222222`;
  await arm('PUT', roleId, { properties: { principalId,
    roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${keyVaultSecretsUserRole}` } }, '2022-04-01');
  const router = createKeyVaultRouter({ store, tokenTrusts: [trust] });
  router.registerVault({ vaultName, subscriptionId: sub, resourceGroupName: name });
  router.setSecret({ vaultName, secretName: 'database-password', value: password });
  const handler = router.handler();
  const port = await listen(createServer({ key: await readFile(vaultTls.key), cert: await readFile(vaultTls.cert) }, (req, res) => {
    res.once('finish', () => report.vaultRequests.push({ method: req.method, path: new URL(req.url, 'https://localhost').pathname,
      bearer: /^Bearer /.test(req.headers.authorization ?? ''), status: res.statusCode }));
    Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  }));
  report.databaseImage = (await exec('docker', ['image', 'inspect', 'postgres:16-alpine', '--format', '{{.Id}}'])).stdout.trim();
  await exec('docker', ['run', '-d', '--name', databaseName, '--network', name, '--network-alias', databaseHost,
    '--label', 'globalstack.experiment=functions-database', '--memory', '512m', '--cpus', '2', '--pids-limit', '128',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456', '--tmpfs', '/tmp:rw,size=16777216',
    '-v', `${sqlTls.key}:/platform/server.key:ro`, '-v', `${sqlTls.cert}:/platform/server.crt:ro`,
    '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=documents', '--entrypoint', 'sh', report.databaseImage,
    '-c', 'cp /platform/server.key /tmp/server.key && cp /platform/server.crt /tmp/server.crt && chown postgres:postgres /tmp/server.key /tmp/server.crt && chmod 600 /tmp/server.key && exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key'],
  { env: { ...process.env, POSTGRES_PASSWORD: password } });
  databaseCreated = true;
  const deadline = Date.now() + 30000;
  while (true) {
    try { await exec('docker', ['exec', databaseName, 'pg_isready', '-U', 'pilot', '-d', 'documents']); break; }
    catch { assert.ok(Date.now() < deadline, 'PostgreSQL fixture did not become ready'); await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  const settings = { DB_AUTH_MODE: 'key-vault', KEY_VAULT_ENDPOINT: `https://${vaultName}.vault.azure.net:${port}`,
    DB_PASSWORD_SECRET: 'database-password', DB_HOST: databaseHost, DB_NAME: 'documents', DB_USER: 'pilot',
    PGSSLROOTCERT: '/globalstack-platform-ca.pem', STORAGE_RESOURCE_ID: `${group}/providers/Microsoft.Storage/storageAccounts/probe`,
    LANDING_CONTAINER: 'landing', QUARANTINE_CONTAINER: 'quarantine', PROJECTION_CONTAINER: 'projection',
    SCANNER_ENDPOINT: 'https://scanner.invalid', SCANNER_SCOPE: 'api://scanner/.default', SEARCH_ENDPOINT: 'https://search.invalid',
    SEARCH_INDEX: 'documents', FAILURES_NAMESPACE: 'failures.servicebus.windows.net', FAILURES_QUEUE: 'document-failures' };
  const script = `
    import assert from 'node:assert/strict';
    import { clients, closeClients } from './adapters.mjs';
    import { migrate } from './repository.mjs';
    const phase = process.argv[1];
    try {
      const { pool } = await clients();
      if (phase === 'role-removed') {
        await assert.rejects(pool.query('SELECT 1'), /Database secret lookup failed/);
        console.log(JSON.stringify({ phase, connectionDenied: true }));
      } else if (phase === 'untrusted-ca') {
        await assert.rejects(pool.query('SELECT 1'), /self-signed certificate|unable to verify|certificate/i);
        console.log(JSON.stringify({ phase, certificateRejected: true }));
      } else {
        const result = await pool.query('SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()');
        assert.equal(result.rows[0].ssl, true); assert.match(result.rows[0].version, /^TLSv1\\.[23]$/);
        await migrate(pool);
        assert.equal((await pool.query('SELECT count(*)::integer AS count FROM document_outbox')).rows[0].count, 0);
        console.log(JSON.stringify({ phase, encrypted: true, tlsVersion: result.rows[0].version, schemaMigrated: true }));
      }
    } finally { await closeClients(); }
  `;
  return { report, dockerArgs: ['--add-host', `${vaultName}.vault.azure.net:${gateway}`],
    async exercise(containerName) {
      for (const phase of ['authorized', 'untrusted-ca', 'role-removed']) {
        if (phase === 'role-removed') await arm('DELETE', roleId, undefined, '2022-04-01');
        const env = { ...process.env, ...settings, ...(phase === 'untrusted-ca' ? { PGSSLROOTCERT: '/etc/ssl/certs/ca-certificates.crt' } : {}) };
        try {
          const { stdout } = await exec('docker', ['exec', ...Object.keys(settings).flatMap(key => ['-e', key]),
            '-w', '/home/site/wwwroot', containerName, 'node', '--input-type=module', '-e', script, phase], { env, timeout: 30000, maxBuffer: 65536 });
          report.checks.push(JSON.parse(stdout.trim()));
        } catch { throw new Error(`Native database diagnostic failed during ${phase}; secret values and raw client diagnostics were not retained`); }
      }
      assert.ok(report.vaultRequests.some(item => item.status === 200) && report.vaultRequests.some(item => item.status === 403));
      assert.ok(report.vaultRequests.every(item => item.bearer));
    },
  };
}
