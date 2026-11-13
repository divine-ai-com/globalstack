import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const phases = ['container', 'first-write', 'bounded', 'open', 'clamped', 'all', 'past-end', 'reversed', 'malformed', 'suffix',
  'multiple', 'large-end', 'native-header', 'precedence', 'conditional', 'md5', 'head', 'overwrite', 'historical', 'empty-write', 'empty-get'].map(name => `range-${name}`);
export function compareBlobRanges(report) {
  assert.equal(report.sourceDirty, false);
  assert.equal(report.probesComplete, true);
  assert.deepEqual(report.cleanup, { groupAbsent: true, accountAbsent: true });
  const target = name => {
    const items = report.exchanges.filter(item => item.target === name && item.phase.startsWith('range-'));
    assert.equal(items.length, phases.length);
    const result = new Map(items.map(item => [item.phase, item])); assert.equal(result.size, phases.length);
    for (const phase of phases) assert.ok(result.has(phase), `${name}: missing ${phase}`);
    const historical = new URL(result.get('range-historical').path, 'https://storage.invalid');
    assert.equal(historical.searchParams.get('versionid'), result.get('range-first-write').headers['x-ms-version-id']);
    return result;
  };
  const azure = target('azure'), local = target('local'), differences = [];
  for (const phase of phases) {
    const a = azure.get(phase), b = local.get(phase);
    assert.equal(a.method, b.method, phase); assert.deepEqual(a.request, b.request, phase);
    const path = item => item.path.replace(/versionid=[^&]+/, 'versionid=<deployed-output>');
    assert.equal(path(a), path(b), phase);
    assert.equal(a.status, b.status, `${phase}: status`);
    for (const header of ['content-range', 'content-md5']) assert.equal(a.headers[header], b.headers[header], `${phase}: ${header}`);
    if (a.status < 400) {
      assert.equal(a.body, b.body, `${phase}: bytes`);
      assert.equal(a.headers['content-length'], b.headers['content-length'], `${phase}: length`);
    }
    if (phase === 'range-large-end') {
      assert.equal(a.headers['x-ms-error-code'], undefined);
      assert.equal(b.headers['x-ms-error-code'], 'InvalidHeaderValue');
      differences.push({ phase, status: 400, azure: 'Front-end HTML response without x-ms-error-code', local: 'XML InvalidHeaderValue response' });
    } else assert.equal(a.headers['x-ms-error-code'], b.headers['x-ms-error-code'], `${phase}: error code`);
  }
  return { scope: 'Selected Blob range API contracts, not full protocol or application parity.', revision: report.revision,
    comparedPhases: phases.length, statusMatches: phases.length, successfulBodiesAndSelectedHeadersMatch: true,
    knownDifferences: differences, cleanupVerified: true,
    exclusions: ['Error response body text and length', 'All unselected response headers', 'Malformed custom x-ms-range syntax', 'CRC64', 'Full IaC lifecycle and Portal screenshots'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = compareBlobRanges(JSON.parse(await readFile(process.argv[2], 'utf8')));
  const text = JSON.stringify(result, null, 2) + '\n';
  if (process.argv[3]) await writeFile(process.argv[3], text);
  else process.stdout.write(text);
}
