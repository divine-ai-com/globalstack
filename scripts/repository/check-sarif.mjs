import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function securityFindings(report) {
  if (!Array.isArray(report.runs) || !report.runs.length) throw new Error('Missing SARIF runs.');
  const findings = [];
  for (const run of report.runs) {
    if (run.invocations?.some(invocation => invocation.executionSuccessful === false)) throw new Error('Static analysis did not complete successfully.');
    if (!Array.isArray(run.results)) throw new Error('Missing SARIF results.');
    const rules = run.tool?.driver?.rules ?? [];
    for (const result of run.results) {
      const rule = rules.find(item => item.id === result.ruleId) ?? rules[result.ruleIndex];
      const severity = Number(rule?.properties?.['security-severity'] ?? 0);
      if (severity >= 7) findings.push({ rule: result.ruleId, severity, locations: result.locations });
    }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  const files = (await readdir(directory)).filter(file => file.endsWith('.sarif'));
  if (!files.length) throw new Error('No SARIF reports were generated.');
  let failures = 0;
  for (const file of files) {
    const findings = securityFindings(JSON.parse(await readFile(join(directory, file), 'utf8')));
    failures += findings.length;
    for (const finding of findings) console.error(JSON.stringify(finding));
  }
  console.log(`High or critical static-analysis findings: ${failures}`);
  process.exitCode = failures ? 1 : 0;
}
