import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { spawn } from 'node:child_process';
import { azureError, shallowAzureErrorCodes } from '../../packages/conformance/src/azure-capture-classification.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const outRoot = join(root, 'docs', 'conformance');

const lowRiskNamespaces = new Set([
  'Microsoft.Storage',
  'Microsoft.KeyVault',
  'Microsoft.EventGrid',
  'Microsoft.Network',
  'Microsoft.AppConfiguration',
  'Microsoft.ServiceBus',
  'Microsoft.EventHub',
  'Microsoft.Insights',
  'Microsoft.OperationalInsights',
  'Microsoft.ManagedIdentity',
  'Microsoft.Authorization',
  'Microsoft.Web',
  'Microsoft.Logic',
]);

const approvalRequiredNamespaces = new Set([
  'Microsoft.ApiManagement',
  'Microsoft.Cache',
  'Microsoft.Cdn',
  'Microsoft.ContainerRegistry',
  'Microsoft.ContainerService',
  'Microsoft.DataMigration',
  'Microsoft.DBforMySQL',
  'Microsoft.DBforPostgreSQL',
  'Microsoft.DocumentDB',
  'Microsoft.NetApp',
  'Microsoft.Synapse',
  'Microsoft.TableStorage',
]);

function namespaceFromResourceType(resourceType) {
  return String(resourceType).split('/')[0];
}

function run(command, args) {
  return new Promise(resolve => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function providerState(namespace) {
  const result = await run('az', ['provider', 'show', '--namespace', namespace, '--query', 'registrationState', '--output', 'tsv']);
  if (result.code !== 0) return 'Unknown';
  return result.stdout.trim() || 'Unknown';
}

const entries = await readdir(fixtureRoot).catch(() => []);
const byNamespace = new Map();
for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
  const code = azureError(fixture)?.code ?? null;
  const depth = fixture.globalstack?.validationDepth;
  if (depth !== 'subscription-or-provider-readiness' && !shallowAzureErrorCodes.has(code)) continue;
  const namespace = namespaceFromResourceType(fixture.resourceType);
  if (!byNamespace.has(namespace)) {
    byNamespace.set(namespace, {
      namespace,
      registrationState: 'Unknown',
      risk: lowRiskNamespaces.has(namespace)
        ? 'low-risk-registration'
        : approvalRequiredNamespaces.has(namespace)
          ? 'approval-required'
          : 'unknown-risk',
      captureCount: 0,
      errorCodes: {},
      resourceTypes: new Set(),
      fixtureIds: [],
    });
  }
  const item = byNamespace.get(namespace);
  item.captureCount += 1;
  item.errorCodes[code ?? 'no-error-code'] = (item.errorCodes[code ?? 'no-error-code'] ?? 0) + 1;
  item.resourceTypes.add(fixture.resourceType);
  item.fixtureIds.push(fixture.id);
}

const namespaces = [...byNamespace.values()].sort((a, b) => a.namespace.localeCompare(b.namespace));
for (const item of namespaces) {
  item.registrationState = await providerState(item.namespace);
  item.resourceTypes = [...item.resourceTypes].sort();
}

const report = {
  generatedAt: new Date().toISOString(),
  shallowCaptureCount: namespaces.reduce((sum, item) => sum + item.captureCount, 0),
  namespaces,
};

const lines = [
  '# Provider Registration Gap Report',
  '',
  'This report is generated from shallow Azure captures. It separates provider-registration/readiness blockers from provider-level validation evidence.',
  '',
  `- Shallow captures: ${report.shallowCaptureCount}`,
  `- Namespaces: ${namespaces.length}`,
  '',
  '| Namespace | Registration State | Risk | Captures | Error Codes |',
  '|---|---|---|---:|---|',
];
for (const item of namespaces) {
  const codes = Object.entries(item.errorCodes).map(([code, count]) => `${code}: ${count}`).join(', ');
  lines.push(`| ${item.namespace} | ${item.registrationState} | ${item.risk} | ${item.captureCount} | ${codes} |`);
}
lines.push('');
lines.push('## Policy');
lines.push('');
lines.push('Only `low-risk-registration` namespaces may be registered automatically. `approval-required` namespaces need explicit approval because registration can enable paid resource providers or slow provisioning paths.');
lines.push('');

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'provider-registration-gaps.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'provider-registration-gaps.md'), `${lines.join('\n')}\n`);

console.log(`Wrote provider registration gap report for ${namespaces.length} namespaces`);
