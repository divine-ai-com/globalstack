import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function securityFindings(report) {
  if (!Array.isArray(report.runs) || !report.runs.length) throw new Error('Missing SARIF runs.');
  const findings = [];
  for (const run of report.runs) {
    if (run.invocations?.some(invocation => invocation.executionSuccessful === false)) throw new Error('Static analysis did not complete successfully.');
    if (!Array.isArray(run.results)) throw new Error('Missing SARIF results.');
    const components = [run.tool?.driver, ...(run.tool?.extensions ?? [])].filter(Boolean);
    const rules = components.flatMap(component => component.rules ?? []);
    for (const result of run.results) {
      const ruleId = result.ruleId ?? result.rule?.id;
      const componentIndex = result.rule?.toolComponent?.index;
      const component = componentIndex === undefined ? run.tool?.driver : run.tool?.extensions?.[componentIndex];
      const candidates = rules.filter(item => item.id === ruleId);
      const rule = component?.rules?.find(item => item.id === ruleId)
        ?? (candidates.length === 1 ? candidates[0] : undefined)
        ?? component?.rules?.[result.rule?.index ?? result.ruleIndex];
      if (!rule || (ruleId && rule.id !== ruleId)) throw new Error(`Missing or ambiguous SARIF rule metadata: ${ruleId ?? 'unknown'}`);
      const score = rule.properties?.['security-severity'];
      if (score === undefined && rule.properties?.tags?.includes('security')) throw new Error(`Missing security severity for ${rule.id}`);
      if (score !== undefined && (typeof score !== 'number' && typeof score !== 'string' || String(score).trim() === '')) throw new Error(`Invalid security severity for ${rule.id}`);
      const severity = Number(score ?? 0);
      if (!Number.isFinite(severity) || severity < 0 || severity > 10) throw new Error(`Invalid security severity for ${rule.id}`);
      if (severity >= 7) findings.push({ rule: rule.id, severity, locations: result.locations });
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
