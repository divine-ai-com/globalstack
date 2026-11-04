import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('./evidence/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const record = await read('validation.json');
const flows = await read('flows.json');
const providers = await read('provider-lifecycles.json');
assert.match(record.runtimeRevision, /^[a-f0-9]{40}$/);
assert.match(flows.sourceRevision, /^[a-f0-9]{40}$/);
assert.equal(record.nativePlatforms.length, 9);
assert.equal(new Set(record.nativePlatforms.map(row => row.platformId)).size, 9);
for (const row of record.nativePlatforms) {
  assert.equal(row.ok, true);
  assert.equal(row.cleanupExitCode, 0);
  assert.equal(row.stages.length, 7);
  assert.ok(row.stages.every(stage => stage.ok));
  assert.equal(row.providerLifecycleOk, true);
  const lifecycle = providers.platforms.find(item => item.platformId === row.platformId);
  assert.equal(lifecycle.sourceRevision, row.sourceRevision);
  assert.equal(lifecycle.operations.length, row.providerLifecycleOperationCount);
  assert.ok(lifecycle.operations.every(operation => operation.status === 'PASS'));
}
assert.equal(flows.scenarios.length, 2);
const episodes = flows.scenarios.flatMap(scenario => {
  assert.equal(scenario.cleanupVerified, true);
  assert.equal(scenario.episodes.length, 4);
  return scenario.episodes.map(episode => ({ ...episode, scenario: scenario.scenario }));
});
assert.equal(new Set(episodes.map(episode => episode.requestId)).size, 8);
for (const episode of episodes) {
  assert.equal(episode.input.requestId, episode.requestId);
  assert.ok(episode.observedBoundaries.length > 0);
  assert.ok(episode.observedBoundaries.every(hop => hop.requestId === episode.requestId));
  const accepted = episode.deliveries.filter(item => item.path === '/accepted');
  const input = episode.input;
  const data = { requestId: input.requestId, course: input.course };
  const expected = episode.scenario === 'vault-enrichment' ? { ...data, office: 'curriculum-office' } : [{
    id: input.requestId, subject: 'course-feed', eventType: 'Course.Ready', eventTime: input.eventTime, dataVersion: '1.0', data,
  }];
  const outcome = accepted.length === 1 && (() => {
    try { assert.deepEqual(accepted[0].body, expected); return true; } catch { return false; }
  })();
  assert.equal(outcome, episode.expectedOutcomeObserved);
  assert.equal(!outcome, episode.outcomeAssertionRejected);
}
assert.equal(episodes.filter(row => row.expectedOutcomeObserved).length, 4);
assert.equal(episodes.filter(row => !row.expectedOutcomeObserved && row.workflowStatus === 'Succeeded').length, 3);
assert.equal(episodes.filter(row => !row.expectedOutcomeObserved && row.workflowStatus === 'Failed').length, 1);
assert.ok(episodes.filter(row => row.expectedOutcomeObserved).every(row => row.workflowStatus === 'Succeeded'));
for (const [service, expected] of [['key-vault', 99], ['event-grid', 45], ['logic-workflows', 62]]) {
  assert.equal(record.serviceSuites.find(row => row.service === service).passed, expected);
}
assert.equal(record.localChecks.failed, 0);
assert.equal(record.repositoryChecks.failed, 0);
const tex = value => String(value).replace(/[\\{}$&#_%]/g, char => `\\${char}`);
const macros = {
  SnapshotDate: record.recordedAt.slice(0, 10), NativeCount: record.nativePlatforms.length,
  EpisodeCount: episodes.length, ProviderOperationCount: record.nativePlatforms.reduce((sum, row) => sum + row.providerLifecycleOperationCount, 0),
  LocalPassed: record.localChecks.passed, LocalSkipped: record.localChecks.skipped, RepositoryPassed: record.repositoryChecks.passed,
};
await writeFile(new URL('measurements.tex', root), Object.entries(macros).map(([key, value]) => `\\newcommand{\\${key}}{${tex(value)}}`).join('\n') + '\n');
const names = {
  'azure-terraform-hcl': ['Terraform HCL', `Terraform ${record.tools.terraform}; AzAPI ${record.tools.azapi}`],
  'azure-opentofu-hcl': ['OpenTofu HCL', `OpenTofu ${record.tools.opentofu}; AzAPI ${record.tools.azapi}`],
  'azure-pulumi-ts': ['Pulumi TypeScript', `CLI ${record.tools.pulumiCli}; Azure Native ${record.tools.pulumiTypeScriptAzureNative}`],
  'azure-pulumi-py': ['Pulumi Python', `CLI ${record.tools.pulumiCli}; Azure Native ${record.tools.pulumiPythonAzureNative}`],
  'azure-pulumi-yaml': ['Pulumi YAML', `CLI ${record.tools.pulumiCli}; Azure Native ${record.tools.pulumiYamlAzureNative}`],
  'azure-ansible-yaml': ['Ansible', `Core ${record.tools.ansibleCore}; collection ${record.tools.azureAzcollection}`],
  'azure-cli-rest': ['Azure CLI REST', `Azure CLI ${record.tools.azureCli}`],
  'azure-bicep': ['Bicep', `Bicep ${record.tools.bicep}; Azure CLI ${record.tools.azureCli}`],
  'azure-arm-json': ['ARM JSON', `Azure CLI ${record.tools.azureCli}`],
};
function table(columns, headers, rows) {
  const line = row => row.map(tex).join(' & ') + String.raw` \\`;
  return String.raw`\begin{tabular}{${columns}}\toprule
${line(headers)}\midrule
${rows.map(line).join('\n')}
\bottomrule\end{tabular}
`;
}
await writeFile(new URL('matrix-rows.tex', root), table('lll', ['Configuration', 'Native tool or SDK', 'Result'],
  record.nativePlatforms.map(row => [...names[row.platformId], '7/7; cleanup passed'])));
await writeFile(new URL('flow-rows.tex', root), table('llll', ['Scenario', 'Configuration', 'Workflow', 'Exact outcome'],
  episodes.map(row => [row.scenario === 'vault-enrichment' ? 'Enrichment' : 'Event routing', row.label, row.workflowStatus, row.expectedOutcomeObserved ? 'Yes' : 'No (expected)'])));
await writeFile(new URL('provenance.tex', root), [
  `Base runtime and native matrix revision: \\texttt{${record.runtimeRevision.slice(0, 12)}}.`,
  `TypeScript dependency rerun revision: \\texttt{${record.nativePlatforms.find(row => row.platformId === 'azure-pulumi-ts').sourceRevision.slice(0, 12)}}.`,
  `Flow evidence revision: \\texttt{${flows.sourceRevision.slice(0, 12)}}.`,
  'Full revisions, image identifiers, commands, and limitations are retained in the adjacent JSON records.',
  `Minimum free disk during the native runs: ${record.diskGuard.minimumFreeGiB} GiB.`,
].join('\n\n') + '\n');
console.log('Evidence assertions passed; generated manuscript tables and counts.');
