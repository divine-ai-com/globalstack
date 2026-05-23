import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractTapStack,
  integrationTest,
  scenarios,
  validateTapStack,
} from './run-openai-azure-complex-pulumi-bundles.mjs';

test('extractTapStack accepts the exact path-qualified fence', () => {
  const response = [
    '```ts path="lib/tap-stack.ts"',
    'export function createTapStack() {',
    '  return {};',
    '}',
    '```',
  ].join('\n');

  assert.equal(
    extractTapStack(response),
    [
      'export function createTapStack() {',
      '  return {};',
      '}',
      '',
    ].join('\n'),
  );
});

test('extractTapStack falls back to the strongest matching typescript block', () => {
  const response = [
    'Here is the file.',
    '```ts',
    'import * as pulumi from "@pulumi/pulumi";',
    'import * as azure from "@pulumi/azure-native";',
    '',
    'export function createTapStack() {',
    '  return {};',
    '}',
    '```',
  ].join('\n');

  assert.match(extractTapStack(response), /export function createTapStack/);
});

test('extractTapStack accepts a raw code-only response when the model omits fences', () => {
  const response = [
    'import * as pulumi from "@pulumi/pulumi";',
    'import * as azure from "@pulumi/azure-native";',
    '',
    'export function createTapStack() {',
    '  return {};',
    '}',
  ].join('\n');

  assert.match(extractTapStack(response), /createTapStack/);
});

test('Pr91023 includes an activity log alert integration check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91023');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.typePath === 'activityLogAlerts/ala-edge-ops-91023'),
  );
});

test('Pr91026 private DNS record integration checks use relative record set names', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91026');
  assert.ok(scenario);
  const gatewayRecord = scenario.integrationChecks.find((check) => check.label === 'gateway-record');
  const filesRecord = scenario.integrationChecks.find((check) => check.label === 'files-record');
  assert.equal(gatewayRecord.typePath, 'privateDnsZones/branch.internal/A/gateway');
  assert.equal(filesRecord.typePath, 'privateDnsZones/branch.internal/A/files');
});

test('Pr91028 includes east and west topic subscription checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91028');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-east'
      && check.typePath === 'namespaces/sb-cutover-91028/topics/cutover-events/subscriptions/east'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-west'
      && check.typePath === 'namespaces/sb-cutover-91028/topics/cutover-events/subscriptions/west'),
  );
});

test('Pr91029 includes an activity log alert integration check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91029');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.typePath === 'activityLogAlerts/ala-partner-command-91029'),
  );
});

test('Pr91030 includes both regional AKS clusters and Front Door security policy', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91030');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'aks-east'
      && check.typePath === 'managedClusters/aks-sec-east-91030'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'aks-west'
      && check.typePath === 'managedClusters/aks-sec-west-91030'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-inference-sec-91030/securityPolicies/inference-sec-policy'),
  );
});

test('Pr91031 private DNS record integration checks use relative record set names', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91031');
  assert.ok(scenario);
  const gatewayRecord = scenario.integrationChecks.find((check) => check.label === 'gateway-record');
  const workersRecord = scenario.integrationChecks.find((check) => check.label === 'workers-record');
  const filesRecord = scenario.integrationChecks.find((check) => check.label === 'files-record');
  assert.equal(gatewayRecord.typePath, 'privateDnsZones/fabric.internal/A/gateway');
  assert.equal(workersRecord.typePath, 'privateDnsZones/fabric.internal/A/workers');
  assert.equal(filesRecord.typePath, 'privateDnsZones/fabric.internal/A/files');
});

test('Pr91032 includes Synapse workspace and SQL pool checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91032');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-workspace'
      && check.typePath === 'workspaces/syn-replay-91032'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-replay-91032/sqlPools/replaypool'),
  );
});

test('Pr91033 includes Cosmos SQL database and container checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91033');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-database'
      && check.typePath === 'databaseAccounts/cosmos-command-fabric-91033/sqlDatabases/CommandStateDb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-command-fabric-91033/sqlDatabases/CommandStateDb/containers/CommandState'),
  );
});

test('Pr91034 private DNS record integration checks use relative record set names', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91034');
  assert.ok(scenario);
  const gatewayRecord = scenario.integrationChecks.find((check) => check.label === 'gateway-record');
  const workersRecord = scenario.integrationChecks.find((check) => check.label === 'workers-record');
  const filesRecord = scenario.integrationChecks.find((check) => check.label === 'files-record');
  assert.equal(gatewayRecord.typePath, 'privateDnsZones/handoff.internal/A/gateway');
  assert.equal(workersRecord.typePath, 'privateDnsZones/handoff.internal/A/workers');
  assert.equal(filesRecord.typePath, 'privateDnsZones/handoff.internal/A/files');
});

test('Pr91035 includes both regional AKS clusters and the canary subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91035');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-release-east-91035'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-release-west-91035'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-canary'
      && check.typePath === 'namespaces/sb-release-ring-91035/topics/release-approvals/subscriptions/canary'),
  );
});

test('Pr91036 includes Synapse and Cosmos integration checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91036');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-workspace'
      && check.typePath === 'workspaces/syn-warehouse-91036'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-warehouse-91036/sqlDatabases/WarehouseStateDb/containers/WarehouseState'),
  );
});

test('Pr91037 includes DMS project and MySQL database checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91037');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project'
      && check.typePath === 'services/dms-migration-command-91037/projects/migration-command-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-migration-command-91037/databases/migrationdb'),
  );
});

test('Pr91038 includes Front Door route, public DNS record, and API Management operation policy checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91038');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-route'
      && check.typePath === 'profiles/afd-serving-gov-91038/afdEndpoints/serving-gov-endpoint/routes/serving-gov-route'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'public-dns-record'
      && check.typePath === 'dnsZones/serving91038.contoso.net/CNAME/api'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-operation-policy'
      && check.typePath === 'service/apim-serving-gov-91038/apis/serving-gov-api/operations/promote-ring/policies/policy'),
  );
});

test('Pr91039 includes both DMS projects and the API Management operation policy check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91039');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-dual-cutover-91039/projects/mysql-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-dual-cutover-91039/projects/postgres-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-operation-policy'
      && check.typePath === 'service/apim-dual-cutover-91039/apis/dual-cutover-api/operations/start-cutover/policies/policy'),
  );
});

test('Pr91040 includes public and private DNS record checks plus regional public IP checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91040');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'public-dns-east-record'
      && check.typePath === 'dnsZones/branch91040.contoso.net/A/east'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-files-record'
      && check.typePath === 'privateDnsZones/branch.internal/A/files'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-public-ip'
      && check.typePath === 'publicIPAddresses/pip-branch-east-91040'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-public-ip'
      && check.typePath === 'publicIPAddresses/pip-branch-west-91040'),
  );
});

test('Pr91041 includes both IoT Hubs, both Event Hubs, and the Digital Twins check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91041');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-digital-east-91041'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-digital-west-91041/eventhubs/telemetry-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-digital-command-91041'),
  );
});

test('Pr91042 includes Synapse, Cosmos, and replay subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91042');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-workspace'
      && check.typePath === 'workspaces/syn-replay-warehouse-91042'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-replay-warehouse-91042/sqlDatabases/ReplayStateDb/containers/ReplayState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-reconcile'
      && check.typePath === 'namespaces/sb-replay-warehouse-91042/topics/replay-commands/subscriptions/reconcile'),
  );
});

test('Pr91043 includes Front Door, both DMS projects, and the rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91043');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-route'
      && check.typePath === 'profiles/afd-cutover-edge-91043/afdEndpoints/cutover-edge-endpoint/routes/cutover-edge-route'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-edge-91043/projects/mysql-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-cutover-edge-91043/topics/cutover-approvals/subscriptions/rollback'),
  );
});

test('Pr91044 includes both AKS clusters, private DNS files record, and Azure Files share', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91044');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-robotics-east-91044'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-files-record'
      && check.typePath === 'privateDnsZones/robotics.internal/A/files'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'file-share'
      && check.typePath === 'storageAccounts/azrobotics91044/fileServices/default/shares/robotics-drop'),
  );
});

test('Pr91045 includes Front Door security policy, Logic App, PostgreSQL database, and all topic subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91045');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('dns.Zone'));
  assert.ok(scenario.requiredSourceMarkers.includes('dns.RecordSet'));
  assert.ok(scenario.requiredSourceMarkers.includes('redis.Redis'));
  assert.ok(scenario.requiredSourceMarkers.includes('monitor.ActionGroup'));
  assert.ok(scenario.requiredSourceMarkers.includes('applicationinsights.Component'));
  assert.ok(scenario.forbiddenSourceMarkers.includes('network.WebApplicationFirewallPolicy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-exception-governance-91045/securityPolicies/exception-governance-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'waf-policy'
      && check.expectedType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/la-exception-governance-91045'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-exception-governance-91045/databases/exceptiondb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-risk'
      && check.typePath === 'namespaces/sb-exception-governance-91045/topics/exception-events/subscriptions/risk'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-finance'
      && check.typePath === 'namespaces/sb-exception-governance-91045/topics/exception-events/subscriptions/finance'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-ops'
      && check.typePath === 'namespaces/sb-exception-governance-91045/topics/exception-events/subscriptions/ops'),
  );
});

test('Pr91046 includes dual AKS, dual Application Gateways, private DNS links, and all dispatch subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91046');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.FileShare'));
  assert.ok(scenario.forbiddenSourceMarkers.includes('apimanagement'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-application-gateway'
      && check.typePath === 'applicationGateways/agw-robotics-east-91046'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-robotics-west-91046'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-link-east'
      && check.typePath === 'privateDnsZones/robotics91046.internal/virtualNetworkLinks/robotics-link-east-91046'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-robotics-91046/topics/robotics-dispatch/subscriptions/rollback'),
  );
});

test('Pr91047 includes Event Hubs, Cosmos SQL, Synapse SQL pool, and replay subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91047');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.FileShare'));
  assert.ok(scenario.forbiddenSourceMarkers.includes('containerservice'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'event-hub-ingest'
      && check.typePath === 'namespaces/eh-replay-superplane-91047/eventhubs/replay-ingest'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-replay-superplane-91047/sqlDatabases/ReplayStateDb/containers/ReplayState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-replay-superplane-91047/sqlPools/replaypool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-audit'
      && check.typePath === 'namespaces/sb-replay-superplane-91047/topics/replay-commands/subscriptions/audit'),
  );
});

test('Pr91048 includes APIM, dual database engines, dual DMS projects, and rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91048');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.FileShare'));
  assert.ok(scenario.forbiddenSourceMarkers.includes('containerservice'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-migration-lattice-91048/databases/migrationdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-migration-lattice-91048/databases/migrationledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-migration-lattice-91048/projects/postgres-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-migration-lattice-91048/topics/migration-commands/subscriptions/rollback'),
  );
});

test('Pr91049 includes Front Door security policy, WAF policy, dual AKS, and rollout subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91049');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.forbiddenSourceMarkers.includes('dbformysql'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-rollout-mesh-91049/securityPolicies/rollout-mesh-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'waf-policy'
      && check.expectedType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-rollout-east-91049'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-west'
      && check.typePath === 'namespaces/sb-rollout-mesh-91049/topics/model-rollouts/subscriptions/west'),
  );
});

test('Pr91050 includes dual managed environments, private DNS links, and branch dispatch subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91050');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.FileShare'));
  assert.ok(scenario.forbiddenSourceMarkers.includes('containerservice'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-link-west'
      && check.typePath === 'privateDnsZones/branchops.internal/virtualNetworkLinks/branch-link-west-91050'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-branch-east-91050'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'admin-app'
      && check.typePath === 'containerApps/ca-branch-admin-91050'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-branch-ops-91050/topics/branch-dispatch/subscriptions/replay'),
  );
});

test('Pr91051 includes Front Door, dual managed environments, private DNS links, and all edge subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91051');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-route'
      && check.typePath === 'profiles/afd-private-edge-91051/afdEndpoints/private-edge-endpoint/routes/private-edge-route'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-edge-east-91051'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-link-west'
      && check.typePath === 'privateDnsZones/edge91051.internal/virtualNetworkLinks/edge-link-west-91051'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-audit'
      && check.typePath === 'namespaces/sb-private-edge-91051/topics/edge-commands/subscriptions/audit'),
  );
});

test('Pr91052 includes APIM child resources, workflow, queue, table, and all adjudication subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91052');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('apimanagement.'));
  assert.ok(scenario.requiredSourceMarkers.includes('logic.Workflow'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.Table'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-submit-policy'
      && check.typePath === 'service/apim-adjudication-91052/apis/adjudication-exchange-api/operations/submit-case/policies/policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'queue'
      && check.typePath === 'storageAccounts/azadjexchange91052/queueServices/default/queues/case-callbacks'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'table'
      && check.typePath === 'storageAccounts/azadjexchange91052/tableServices/default/tables/CaseLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-audit'
      && check.typePath === 'namespaces/sb-adjudication-91052/topics/case-commands/subscriptions/audit'),
  );
});

test('Pr91053 includes dual IoT hubs, Digital Twins, Synapse, and all twin command subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91053');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins.'));
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-twin-east-91053'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-twin-ops-91053'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-twin-ops-91053/sqlPools/twinpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-audit'
      && check.typePath === 'namespaces/sb-twin-ops-91053/topics/twin-commands/subscriptions/audit'),
  );
});

test('Pr91054 includes DMS service, three projects, APIM operations, and all cutover subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91054');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-audit'
      && check.typePath === 'services/dms-mig-super-91054/projects/audit-baseline'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-rollback-policy'
      && check.typePath === 'service/apim-mig-super-91054/apis/mig-super-api/operations/rollback-cutover/policies/policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-mig-super-91054/databases/ledgerdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-cutover'
      && check.typePath === 'namespaces/sb-mig-super-91054/topics/cutover-commands/subscriptions/cutover'),
  );
});

test('Pr91055 includes Front Door, dual AKS, APIM operations, private DNS links, and rollout subscriptions', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91055');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('apimanagement.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-model-gateway-91055/securityPolicies/model-gateway-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-model-east-91055'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-drain-policy'
      && check.typePath === 'service/apim-model-gateway-91055/apis/model-gateway-api/operations/drain-model/policies/policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-link-west'
      && check.typePath === 'privateDnsZones/model91055.internal/virtualNetworkLinks/model-link-west-91055'),
  );
});

test('integration test template expects APIM product-api ARM names and types as the API contract', () => {
  const generated = integrationTest();
  assert.match(generated, /check\.expectedType === "Microsoft\.ApiManagement\/service\/products\/apis"/);
  assert.match(generated, /return check\.typePath\.split\("\/"\)\.filter\(Boolean\)\.at\(-1\);/);
  assert.match(generated, /return "Microsoft\.ApiManagement\/service\/apis";/);
});

test('validateTapStack rejects Application Gateway WAF resources when the scenario expects Front Door WAF', () => {
  const scenario = {
    prompt: 'Use Azure Front Door with a Front Door WAF policy.',
    resourceNames: {
      resourceGroup: 'rg-frontdoor-waf',
      frontDoorWaf: 'waf-frontdoor-sample',
    },
    expectedOutputKeys: ['FrontDoorHostName'],
    requiredSourceMarkers: ['frontdoor.Policy'],
    forbiddenSourceMarkers: ['network.WebApplicationFirewallPolicy'],
    integrationChecks: [
      {
        expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies',
      },
    ],
  };

  const tapStack = [
    'import * as azure from "@pulumi/azure-native";',
    'export function createTapStack() {',
    '  const FrontDoorHostName = "example.azurefd.net";',
    '  new azure.network.WebApplicationFirewallPolicy("waf", {',
    '    policyName: "waf-frontdoor-sample",',
    '    resourceGroupName: "rg-frontdoor-waf",',
    '    location: "global",',
    '    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },',
    '    policySettings: { state: "Enabled", mode: "Prevention" },',
    '  });',
    '  return { FrontDoorHostName };',
    '}',
  ].join('\n');

  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /Front Door WAF scenarios must use azure\.frontdoor\.Policy|missing scenario marker frontdoor\.Policy/,
  );
});

test('validateTapStack accepts mixed public and private DNS usage when each resource targets the right zone type', () => {
  const scenario = {
    prompt: 'This task uses public DNS and private DNS together.',
    resourceNames: {
      publicZone: 'public.example.com',
      privateZone: 'private.internal',
    },
    expectedOutputKeys: ['ExampleOutput'],
    requiredSourceMarkers: ['network.RecordSet', 'network.PrivateRecordSet'],
    forbiddenSourceMarkers: ['frontdoor'],
  };

  const tapStack = [
    'import * as azure from "@pulumi/azure-native";',
    'export function createTapStack() {',
    '  const ExampleOutput = "ok";',
    '  new azure.network.RecordSet("public", {',
    '    zoneName: "public.example.com",',
    '    relativeRecordSetName: "api",',
    '  });',
    '  new azure.network.PrivateRecordSet("private", {',
    '    privateZoneName: "private.internal",',
    '    relativeRecordSetName: "api",',
    '  });',
    '  return { ExampleOutput };',
    '}',
  ].join('\n');

  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack does not infer private DNS requirements from a forbidden phrase alone', () => {
  const scenario = {
    prompt: 'Do not add private DNS or private endpoints.',
    expectedOutputKeys: ['ExampleOutput'],
    requiredSourceMarkers: ['network.RecordSet'],
    forbiddenSourceMarkers: ['privateDnsZones'],
    integrationChecks: [
      { typePath: 'dnsZones/example.contoso.net/CNAME/api' },
    ],
    resourceNames: {
      publicDnsZone: 'example.contoso.net',
    },
  };

  const tapStack = [
    'import * as azure from "@pulumi/azure-native";',
    'export function createTapStack() {',
    '  const ExampleOutput = "ok";',
    '  new azure.network.RecordSet("public", {',
    '    zoneName: "example.contoso.net",',
    '    relativeRecordSetName: "api",',
    '  });',
    '  return { ExampleOutput };',
    '}',
  ].join('\n');

  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack rejects application gateway subnet ids derived from virtualNetwork.subnets.apply', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91049');
  assert.ok(scenario);
  const tapStack = `
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as monitor from "@pulumi/azure-native/monitor";
import * as dns from "@pulumi/azure-native/dns";
import * as privatedns from "@pulumi/azure-native/privatedns";
// frontdoor.Policy cdn. dns.Zone dns.RecordSet managedidentity. containerregistry. network.PublicIPAddress network.VirtualNetwork network.ApplicationGateway containerservice. apimanagement. storage.BlobContainer servicebus. eventgrid. keyvault. appconfiguration. monitor.ActionGroup monitor.MetricAlert monitor.ActivityLogAlert operationalinsights.
// east-rollout-origin west-rollout-origin rollout-mesh-route rollout-mesh-security-policy waf-rollout-mesh-91049 rollout91049.contoso.net api id-rollout-mesh-91049 acrrolloutmesh91049 vnet-rollout-west-91049 snet-rollout-agw-west-91049 snet-rollout-aks-east-91049 snet-rollout-aks-west-91049 pip-rollout-east-91049 pip-rollout-west-91049 agw-rollout-west-91049 aks-rollout-east-91049 aks-rollout-west-91049 apim-rollout-mesh-91049 rollout-mesh-api rollout-mesh-product promote-model azrollout91049 model-artifacts sb-rollout-mesh-91049 model-rollouts east west rollback eg-rollout-mesh-91049 kv-rollout-mesh-91049 cfg-rollout-mesh-91049 ag-rollout-mesh-91049 ma-rollout-mesh-91049 ala-rollout-mesh-91049 log-rollout-east-91049 log-rollout-west-91049 appi-rollout-mesh-91049

export function createTapStack() {
  const vnet = new azure.network.VirtualNetwork("vnet-rollout-east-91049", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    virtualNetworkName: "vnet-rollout-east-91049",
    location: "eastus",
    addressSpace: { addressPrefixes: ["10.10.0.0/16"] },
    subnets: [{ name: "snet-rollout-agw-east-91049", addressPrefix: "10.10.1.0/24" }],
  });
  const subnetId = vnet.subnets.apply(items => items?.[0]?.id ?? "");
  new dns.RecordSet("api.rollout91049.contoso.net", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    zoneName: "rollout91049.contoso.net",
    relativeRecordSetName: "api",
    recordType: "CNAME",
    ttl: 300,
    cnameRecord: { cname: "rollout-mesh-endpoint.azurefd.net" },
  });
  new privatedns.PrivateRecordSet("api.rollout91049.internal", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    privateZoneName: "rollout91049.internal",
    relativeRecordSetName: "api",
    recordType: "A",
    ttl: 300,
    aRecords: [{ ipv4Address: "10.10.1.10" }],
  });
  new azure.network.ApplicationGateway("agw-rollout-east-91049", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    applicationGatewayName: "agw-rollout-east-91049",
    location: "eastus",
    sku: { name: "Standard_v2", tier: "Standard_v2", capacity: 2 },
    gatewayIPConfigurations: [{ name: "gwipc", subnet: { id: subnetId } }],
    frontendIPConfigurations: [{ name: "frontend", subnet: { id: subnetId } }],
    frontendPorts: [{ name: "http", port: 80 }],
    backendAddressPools: [{ name: "pool" }],
    backendHttpSettingsCollection: [{ name: "http-settings", port: 80, protocol: "Http", cookieBasedAffinity: "Disabled" }],
    httpListeners: [],
    requestRoutingRules: [],
  });
  return {
    RolloutMeshFrontDoorProfileName: "afd-rollout-mesh-91049",
    RolloutMeshFrontDoorEndpointHostName: "rollout-mesh-endpoint.azurefd.net",
    RolloutMeshOriginGroupName: "rollout-mesh-origins",
    RolloutMeshRouteName: "rollout-mesh-route",
    RolloutMeshSecurityPolicyName: "rollout-mesh-security-policy",
    RolloutMeshPublicDnsZoneName: "rollout91049.contoso.net",
    RolloutMeshPublicDnsRecordName: "api",
    RolloutMeshRegistryName: "acrrolloutmesh91049",
    RolloutMeshManagedIdentityName: "id-rollout-mesh-91049",
    RolloutMeshEastApplicationGatewayName: "agw-rollout-east-91049",
    RolloutMeshEastClusterName: "aks-rollout-east-91049",
    RolloutMeshWestApplicationGatewayName: "agw-rollout-west-91049",
    RolloutMeshWestClusterName: "aks-rollout-west-91049",
    RolloutMeshApiGatewayUrl: "https://apim-rollout-mesh-91049.azure-api.net",
    RolloutMeshStorageAccountName: "azrollout91049",
    RolloutMeshBlobContainerName: "model-artifacts",
    RolloutMeshTopicName: "model-rollouts",
    RolloutMeshEastSubscriptionName: "east",
    RolloutMeshWestSubscriptionName: "west",
    RolloutMeshRollbackSubscriptionName: "rollback",
    RolloutMeshEventGridTopicEndpoint: "https://eg-rollout-mesh-91049.eastus-1.eventgrid.azure.net/api/events",
    RolloutMeshKeyVaultName: "kv-rollout-mesh-91049",
    RolloutMeshAppConfigName: "cfg-rollout-mesh-91049",
    RolloutMeshActionGroupName: "ag-rollout-mesh-91049",
    RolloutMeshMetricAlertName: "ma-rollout-mesh-91049",
    RolloutMeshActivityLogAlertName: "ala-rollout-mesh-91049",
    RolloutMeshEastLogAnalyticsWorkspaceName: "log-rollout-east-91049",
    RolloutMeshWestLogAnalyticsWorkspaceName: "log-rollout-west-91049",
    RolloutMeshAppInsightsName: "appi-rollout-mesh-91049",
  };
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /must not derive subnet ids from virtualNetwork\.subnets\.apply/,
  );
});

test('validateTapStack rejects DNS resources imported from the network submodule', () => {
  const scenario = {
    prompt: 'Use one public DNS zone and one private DNS zone',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['network.RecordSet', 'network.PrivateRecordSet'],
    forbiddenSourceMarkers: [],
  };
  const tapStack = `
import * as network from "@pulumi/azure-native/network";
import * as pulumi from "@pulumi/pulumi";
// network.RecordSet network.PrivateRecordSet

export function createTapStack() {
  new network.Zone("edge91051.contoso.net", {
    resourceGroupName: "rg",
    zoneName: "edge91051.contoso.net",
    location: "global",
  });
  new network.RecordSet("api.edge91051.contoso.net", {
    resourceGroupName: "rg",
    zoneName: "edge91051.contoso.net",
    relativeRecordSetName: "api",
    recordType: "CNAME",
    ttl: 300,
    cnameRecord: { cname: "edge.azurefd.net" },
  });
  new network.PrivateZone("edge91051.internal", {
    resourceGroupName: "rg",
    privateZoneName: "edge91051.internal",
    location: "global",
  });
  new network.PrivateRecordSet("api.edge91051.internal", {
    resourceGroupName: "rg",
    privateZoneName: "edge91051.internal",
    relativeRecordSetName: "api",
    recordType: "A",
    ttl: 300,
    aRecords: [{ ipv4Address: "10.0.0.10" }],
  });
  return {};
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /must not use @pulumi\/azure-native\/network/,
  );
});

test('validateTapStack rejects azure.network DNS resources in Front Door WAF v3 scenarios', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91051');
  assert.ok(scenario);
  const tapStack = `
import * as azure from "@pulumi/azure-native";
import * as frontdoor from "@pulumi/azure-native/frontdoor";
import * as cdn from "@pulumi/azure-native/cdn";
import * as monitor from "@pulumi/azure-native/monitor";
import * as applicationinsights from "@pulumi/azure-native/applicationinsights";
// frontdoor.Policy dns.Zone dns.RecordSet privatedns.PrivateZone privatedns.VirtualNetworkLink privatedns.PrivateRecordSet network.VirtualNetwork app.ManagedEnvironment app.ContainerApp servicebus. storage.BlobContainer storage.FileShare eventgrid. keyvault. appconfiguration. monitor.ActionGroup monitor.MetricAlert monitor.ActivityLogAlert operationalinsights. edge-commands replay audit
// afd-private-edge-91051 private-edge-endpoint private-edge-origins private-edge-origin-east private-edge-origin-west private-edge-route private-edge-security-policy waf-private-edge-91051 edge91051.contoso.net api ops edge91051.internal edge-link-east-91051 edge-link-west-91051 vnet-edge-east-91051 vnet-edge-west-91051 cae-edge-east-91051 cae-edge-west-91051 ca-edge-api-east-91051 ca-edge-api-west-91051 ca-edge-worker-east-91051 ca-edge-worker-west-91051 ca-edge-supervisor-91051 sb-private-edge-91051 edge-commands east west replay audit azprivateedge91051 edge-drop edge-archive edge-files eg-private-edge-91051 kv-private-edge-91051 cfg-private-edge-91051 ag-private-edge-91051 ma-private-edge-91051 ala-private-edge-91051 log-private-edge-east-91051 log-private-edge-west-91051 appi-private-edge-91051

export function createTapStack() {
  new frontdoor.Policy("waf-private-edge-91051", { profileName: "afd-private-edge-91051", resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", policyName: "waf-private-edge-91051", sku: { name: "Premium_AzureFrontDoor" }, policySettings: { enabledState: "Enabled", mode: "Prevention", requestBodyCheck: "Enabled" } });
  new azure.network.Zone("edge91051.contoso.net", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", zoneName: "edge91051.contoso.net", location: "global" });
  new azure.network.RecordSet("api", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", zoneName: "edge91051.contoso.net", relativeRecordSetName: "api", recordType: "CNAME", ttl: 300, cnameRecord: { cname: "edge.azurefd.net" } });
  new azure.network.PrivateZone("edge91051.internal", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", privateZoneName: "edge91051.internal", location: "global" });
  new azure.network.VirtualNetworkLink("edge-link-east-91051", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", privateZoneName: "edge91051.internal", virtualNetworkLinkName: "edge-link-east-91051", location: "global", virtualNetwork: { id: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet-edge-east-91051" }, registrationEnabled: false });
  new azure.network.PrivateRecordSet("api.edge91051.internal", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", privateZoneName: "edge91051.internal", relativeRecordSetName: "api", recordType: "A", ttl: 300, aRecords: [{ ipv4Address: "10.0.0.10" }] });
  return {
    PrivateEdgeFabricPublicDnsZoneName: "edge91051.contoso.net",
    PrivateEdgeFabricPrivateDnsZoneName: "edge91051.internal",
    PrivateEdgeFabricFrontDoorEndpointHostName: "private-edge-endpoint.azurefd.net",
    PrivateEdgeFabricSecurityPolicyName: "private-edge-security-policy",
    PrivateEdgeFabricEastManagedEnvironmentName: "cae-edge-east-91051",
    PrivateEdgeFabricWestManagedEnvironmentName: "cae-edge-west-91051",
    PrivateEdgeFabricEastApiAppName: "ca-edge-api-east-91051",
    PrivateEdgeFabricWestApiAppName: "ca-edge-api-west-91051",
    PrivateEdgeFabricSupervisorAppName: "ca-edge-supervisor-91051",
    PrivateEdgeFabricTopicName: "edge-commands",
    PrivateEdgeFabricEastSubscriptionName: "east",
    PrivateEdgeFabricWestSubscriptionName: "west",
    PrivateEdgeFabricReplaySubscriptionName: "replay",
    PrivateEdgeFabricAuditSubscriptionName: "audit",
    PrivateEdgeFabricStorageAccountName: "azprivateedge91051",
    PrivateEdgeFabricDropContainerName: "edge-drop",
    PrivateEdgeFabricArchiveContainerName: "edge-archive",
    PrivateEdgeFabricFileShareName: "edge-files",
    PrivateEdgeFabricEventGridTopicEndpoint: "https://eg-private-edge-91051.eastus-1.eventgrid.azure.net/api/events",
    PrivateEdgeFabricKeyVaultName: "kv-private-edge-91051",
    PrivateEdgeFabricAppConfigName: "cfg-private-edge-91051",
    PrivateEdgeFabricActionGroupName: "ag-private-edge-91051",
    PrivateEdgeFabricMetricAlertName: "ma-private-edge-91051",
    PrivateEdgeFabricActivityLogAlertName: "ala-private-edge-91051",
    PrivateEdgeFabricEastLogAnalyticsWorkspaceName: "log-private-edge-east-91051",
    PrivateEdgeFabricWestLogAnalyticsWorkspaceName: "log-private-edge-west-91051",
    PrivateEdgeFabricAppInsightsName: "appi-private-edge-91051",
  };
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /@pulumi\/azure-native\/dns/,
  );
});

test('validateTapStack does not infer application gateway requirements from a negative prompt phrase alone', () => {
  const scenario = {
    prompt: 'Keep this limited to the adjudication exchange. Do not add Front Door, Application Gateway, AKS, or private endpoints.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: [],
    forbiddenSourceMarkers: [],
    integrationChecks: [],
  };
  const tapStack = `
export function createTapStack() {
  return {};
}
`;
  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});
