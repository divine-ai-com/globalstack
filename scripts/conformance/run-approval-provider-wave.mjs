import { appendFile, readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
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

const namespaces = (args.get('namespace') ?? '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const register = args.get('register') === 'true';
const allowValidMinimal = args.get('allow-valid-minimal') === 'true';
const dryRun = args.get('dry-run') === 'true';
const pollAttempts = Number(args.get('poll-attempts') ?? 60);
const pollMs = Number(args.get('poll-ms') ?? 10000);

if (namespaces.length === 0) {
  throw new Error('Pass --namespace=<Microsoft.Provider> to keep approval-provider validation scoped.');
}

function namespaceFromResourceType(resourceType) {
  return String(resourceType).split('/')[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

async function registerProvider(namespace) {
  const before = await providerState(namespace);
  if (before === 'Registered') return { before, after: before, registered: false, registerExitCode: 0 };
  const registration = await run('az', ['provider', 'register', '--namespace', namespace, '--output', 'none']);
  if (registration.code !== 0) {
    return {
      before,
      after: await providerState(namespace),
      registered: false,
      registerExitCode: registration.code,
      stderr: registration.stderr.trim(),
      stdout: registration.stdout.trim(),
    };
  }
  let after = await providerState(namespace);
  for (let attempt = 0; attempt < pollAttempts && after !== 'Registered'; attempt += 1) {
    await sleep(pollMs);
    after = await providerState(namespace);
  }
  return { before, after, registered: after === 'Registered', registerExitCode: registration.code };
}

async function conformanceInventory() {
  const result = await run('az', [
    'group',
    'list',
    '--query',
    "[?starts_with(name, 'rg-gs-conf-') || tags.purpose == 'globalstack-conformance'].{name:name,provisioningState:properties.provisioningState,location:location,tags:tags}",
    '--output',
    'json',
  ]);
  if (result.code !== 0) return [{ error: result.stderr.trim() || result.stdout.trim() }];
  try {
    return JSON.parse(result.stdout || '[]');
  } catch {
    return [{ error: result.stdout.trim() }];
  }
}

function isShallowFixture(fixture) {
  const depth = fixture.globalstack?.validationDepth;
  const errorCode = fixture.response?.body?.error?.code ?? null;
  return depth === 'subscription-or-provider-readiness' || shallowAzureErrorCodes.has(errorCode);
}

const namespaceSet = new Set(namespaces);
const entries = await readdir(fixtureRoot).catch(() => []);
const candidates = [];
for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
  if (!isShallowFixture(fixture)) continue;
  const namespace = namespaceFromResourceType(fixture.resourceType);
  if (!namespaceSet.has(namespace)) continue;
  if (fixture.varianceId === 'valid-minimal' && !allowValidMinimal) continue;
  candidates.push({
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

candidates.sort((a, b) =>
  a.namespace.localeCompare(b.namespace)
  || (a.varianceId === 'valid-minimal') - (b.varianceId === 'valid-minimal')
  || a.resourceType.localeCompare(b.resourceType)
  || a.operation.localeCompare(b.operation)
  || a.varianceId.localeCompare(b.varianceId)
);

const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  register,
  allowValidMinimal,
  namespaces,
  registration: [],
  candidateCount: candidates.length,
  candidates,
  reruns: [],
};

for (const namespace of namespaces) {
  const before = await providerState(namespace);
  if (register && !dryRun) {
    const registration = await registerProvider(namespace);
    report.registration.push({ namespace, ...registration });
    console.log(`${namespace}: registration ${registration.before} -> ${registration.after}`);
  } else {
    report.registration.push({ namespace, before, after: before, registered: before === 'Registered', registerExitCode: null });
    console.log(`${namespace}: state ${before}`);
  }
}

if (!dryRun) {
  for (const candidate of candidates) {
    const state = report.registration.find(item => item.namespace === candidate.namespace)?.after ?? await providerState(candidate.namespace);
    if (state !== 'Registered') {
      report.reruns.push({ ...candidate, skipped: true, reason: `provider-state-${state}` });
      console.log(`${candidate.fixtureId}: skipped (${state})`);
      continue;
    }
    const commandArgs = [
      'scripts/conformance/run-azure-api-conformance.mjs',
      '--target=azure',
      `--capability=${candidate.capabilityId}`,
      `--resource-type=${candidate.resourceType}`,
      `--operation=${candidate.operation}`,
      `--case=${candidate.varianceId}`,
    ];
    const result = await run('node', commandArgs, { env: { GLOBALSTACK_REAL_AZURE_CONFORMANCE: '1' } });
    const inventory = await conformanceInventory();
    const tail = result.stdout.trim().split('\n').filter(Boolean).at(-1) ?? result.stderr.trim().split('\n').filter(Boolean).at(-1) ?? 'no output';
    const item = {
      ...candidate,
      command: `node ${commandArgs.join(' ')}`,
      exitCode: result.code,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      leftoverConformanceResourceGroups: inventory,
    };
    report.reruns.push(item);
    console.log(`${candidate.fixtureId}: ${result.code === 0 && inventory.length === 0 ? 'reran' : 'failed'} - ${tail}`);
    if (result.code !== 0 || inventory.length > 0) break;
  }
}

report.failedCount = report.reruns.filter(item => item.exitCode && item.exitCode !== 0).length;
report.leftoverCount = report.reruns.reduce((sum, item) => sum + (item.leftoverConformanceResourceGroups?.length ?? 0), 0);
report.skippedCount = report.reruns.filter(item => item.skipped).length;

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'approval-provider-wave.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!dryRun) {
  await appendFile(join(outRoot, 'approval-provider-wave-history.jsonl'), `${JSON.stringify(report)}\n`);
}

const lines = [
  '# Approval Provider Wave',
  '',
  'This report tracks one-by-one validation for provider namespaces that were not registered during low-risk capture.',
  '',
  `- Dry run: ${dryRun}`,
  `- Register: ${register}`,
  `- Allow valid-minimal: ${allowValidMinimal}`,
  `- Candidate cases: ${report.candidateCount}`,
  `- Failed reruns: ${report.failedCount}`,
  `- Leftover conformance resource groups: ${report.leftoverCount}`,
  '',
  '| Namespace | Before | After |',
  '|---|---|---|',
];
for (const item of report.registration) {
  lines.push(`| ${item.namespace} | ${item.before} | ${item.after} |`);
}
lines.push('', '| Fixture | Variance | Result |', '|---|---|---|');
for (const item of report.reruns) {
  lines.push(`| ${item.fixtureId} | ${item.varianceId} | ${item.skipped ? item.reason : `exit ${item.exitCode}`} |`);
}
lines.push('');

await writeFile(join(outRoot, 'approval-provider-wave.md'), `${lines.join('\n')}\n`);

console.log(`Approval provider wave: ${report.reruns.length}/${report.candidateCount} processed, ${report.failedCount} failed, ${report.leftoverCount} leftover resource groups.`);
if (report.failedCount > 0 || report.leftoverCount > 0) process.exit(1);
