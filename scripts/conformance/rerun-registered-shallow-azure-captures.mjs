import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { conformanceHistoryPath, workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { spawn } from 'node:child_process';
import { shallowAzureErrorCodes } from '../../packages/conformance/src/azure-capture-classification.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const outRoot = conformanceHistoryPath(root);
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));

const dryRun = args.get('dry-run') === 'true';
const namespaceFilter = new Set(
  (args.get('namespace') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
);

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

function namespaceFromResourceType(resourceType) {
  return String(resourceType).split('/')[0];
}

function run(command, commandArgs, opts = {}) {
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

function isShallowFixture(fixture) {
  const depth = fixture.globalstack?.validationDepth;
  const errorCode = fixture.response?.body?.error?.code ?? null;
  return depth === 'subscription-or-provider-readiness' || shallowAzureErrorCodes.has(errorCode);
}

const entries = await readdir(fixtureRoot).catch(() => []);
const candidateMap = new Map();
for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
  if (!isShallowFixture(fixture)) continue;

  const namespace = namespaceFromResourceType(fixture.resourceType);
  if (!lowRiskNamespaces.has(namespace)) continue;
  if (namespaceFilter.size > 0 && !namespaceFilter.has(namespace)) continue;

  const key = [
    fixture.capabilityId,
    fixture.resourceType,
    fixture.operation,
    fixture.varianceId,
  ].join('\u0000');

  candidateMap.set(key, {
    namespace,
    fixtureId: fixture.id,
    capabilityId: fixture.capabilityId,
    resourceType: fixture.resourceType,
    operation: fixture.operation,
    varianceId: fixture.varianceId,
    previousStatus: fixture.response?.status,
    previousErrorCode: fixture.response?.body?.error?.code ?? null,
  });
}

const candidates = [...candidateMap.values()].sort((a, b) =>
  a.namespace.localeCompare(b.namespace)
  || a.resourceType.localeCompare(b.resourceType)
  || a.operation.localeCompare(b.operation)
  || a.varianceId.localeCompare(b.varianceId)
);

const stateCache = new Map();
for (const candidate of candidates) {
  if (!stateCache.has(candidate.namespace)) {
    stateCache.set(candidate.namespace, await providerState(candidate.namespace));
  }
}

const selected = candidates.filter(candidate => stateCache.get(candidate.namespace) === 'Registered');
const skipped = candidates
  .filter(candidate => stateCache.get(candidate.namespace) !== 'Registered')
  .map(candidate => ({ ...candidate, registrationState: stateCache.get(candidate.namespace) }));

const reruns = [];
if (!dryRun) {
  for (const candidate of selected) {
    const commandArgs = [
      'scripts/conformance/run-azure-api-conformance.mjs',
      '--target=azure',
      `--capability=${candidate.capabilityId}`,
      `--resource-type=${candidate.resourceType}`,
      `--operation=${candidate.operation}`,
      `--case=${candidate.varianceId}`,
    ];
    const result = await run('node', commandArgs, {
      env: { GLOBALSTACK_REAL_AZURE_CONFORMANCE: '1' },
    });
    reruns.push({
      ...candidate,
      command: `node ${commandArgs.join(' ')}`,
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
    const tail = result.stdout.trim().split('\n').filter(Boolean).at(-1) ?? result.stderr.trim().split('\n').filter(Boolean).at(-1) ?? 'no output';
    console.log(`${candidate.fixtureId}: ${result.code === 0 ? 'reran' : 'failed'} - ${tail}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  candidateCount: candidates.length,
  selectedCount: selected.length,
  skippedCount: skipped.length,
  failedCount: reruns.filter(item => item.exitCode !== 0).length,
  providerStates: Object.fromEntries([...stateCache.entries()].sort()),
  selected,
  skipped,
  reruns,
};

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'registered-shallow-rerun.json'), `${JSON.stringify(report, null, 2)}\n`);

const lines = [
  '# Registered Shallow Azure Rerun',
  '',
  'This report reruns only shallow real-Azure captures for low-risk namespaces that are currently registered in the subscription.',
  '',
  `- Dry run: ${dryRun}`,
  `- Candidate shallow low-risk cases: ${candidates.length}`,
  `- Selected registered cases: ${selected.length}`,
  `- Skipped unregistered cases: ${skipped.length}`,
  `- Failed reruns: ${report.failedCount}`,
  '',
  '| Namespace | State | Selected Cases |',
  '|---|---|---:|',
];
for (const [namespace, state] of [...stateCache.entries()].sort()) {
  lines.push(`| ${namespace} | ${state} | ${selected.filter(item => item.namespace === namespace).length} |`);
}
lines.push('');

await writeFile(join(outRoot, 'registered-shallow-rerun.md'), `${lines.join('\n')}\n`);

console.log(`Registered shallow rerun: selected ${selected.length}/${candidates.length} candidates${dryRun ? ' (dry run)' : ''}.`);
if (report.failedCount > 0) process.exit(1);
