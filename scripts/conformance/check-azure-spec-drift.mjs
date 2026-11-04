import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function compareSpecDirectories(baseline, directories) {
  if (!Array.isArray(directories)) throw new Error('Expected a complete specification directory listing.');
  return baseline.trackedPaths.flatMap(entry => {
    const current = directories.find(item => item.path === entry.path && item.type === 'dir');
    if (current?.sha === entry.treeSha) return [];
    return [{ path: entry.path, previousTreeSha: entry.treeSha, currentTreeSha: current?.sha ?? null,
      status: current ? 'changed' : 'missing',
      affectedCapabilities: baseline.capabilities.filter(capability => capability.paths.includes(entry.path) || entry.path === 'specification/resources').map(capability => capability.id),
    }];
  });
}

export async function checkAzureSpecDrift() {
  const root = new URL('../../', import.meta.url);
  const baseline = JSON.parse(await readFile(new URL('docs/conformance/azure-spec-baseline.json', root), 'utf8'));
  async function github(path) {
    const response = await fetch(`https://api.github.com/repos/Azure/azure-rest-api-specs/${path}`, {
      headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Specification check failed with HTTP ${response.status}. No compatibility conclusion is available.`);
    return response.json();
  }
  const { sha: revision } = await github('commits/main');
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('Invalid upstream revision.');
  const directories = await github(`contents/specification?ref=${revision}`);
  // GitHub's Contents API caps listings at 1,000 entries. Never treat a capped response as complete.
  if (directories.length >= 1000) throw new Error('Specification listing may be truncated; review using the Git tree API.');
  const changes = compareSpecDirectories(baseline, directories);
  const report = { checkedAt: new Date().toISOString(), baselineRevision: baseline.revision, upstreamRevision: revision,
    status: changes.length ? 'review-required' : 'no-directory-changes', changes,
    limitation: 'Directory hashes detect specification, example and documentation changes. They do not establish service behavior or measured parity.',
  };
  const output = new URL('dist/spec-drift/', root);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
  const summary = `# Azure specification watch\n\nStatus: ${report.status}\n\nBaseline: ${baseline.revision}\n\nChecked revision: ${revision}\n\n${changes.map(change => `- ${change.path}: ${change.status}; capabilities: ${change.affectedCapabilities.join(', ')}`).join('\n') || 'No changes detected in the watched directories.'}\n\n${report.limitation}\n`;
  await writeFile(new URL('report.md', output), summary);
  console.log(summary);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await checkAzureSpecDrift();
  if (report.changes.length) process.exitCode = 2;
}
