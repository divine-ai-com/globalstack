export function postgresSqlPairPassed(report) {
  return !report.error && report.comparisonComplete === true
    && report.azureTerminalState === 'Succeeded' && report.localTerminalState === 'Succeeded'
    && report.cleanup?.resourcesAbsent === true && report.cleanup?.deploymentsAbsent === true
    && report.localCleanup?.complete === true
    && [200, 201, 202].includes(report.firewall?.azure?.initialStatus)
    && [200, 201, 202].includes(report.firewall?.local?.initialStatus)
    && report.sql?.azure?.connection?.status === 'passed'
    && report.sql.azure.schema?.status === 'passed'
    && report.sql.local.attempted === true
    && report.sql.local.connection?.status === 'passed'
    && report.sql.local.schema?.status === 'passed';
}
