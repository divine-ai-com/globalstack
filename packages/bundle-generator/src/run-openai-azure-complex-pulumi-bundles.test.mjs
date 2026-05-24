import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractTapStack,
  generationHints,
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

test('Pr91119 generation hints require ActionGroup enabled', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91119');
  assert.ok(scenario);
  const hints = generationHints(scenario);
  assert.ok(
    hints.some((hint) => hint.includes('ActionGroup also requires enabled: true')),
  );
});

test('Pr91120 generation hints forbid load balancer self-reference', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91120');
  assert.ok(scenario);
  const hints = generationHints(scenario);
  assert.ok(
    hints.some((hint) => hint.includes('Do not reference the LoadBalancer resource variable inside its own constructor.')),
  );
  assert.ok(
    hints.some((hint) => hint.includes('Do not let east and west load balancer declarations capture themselves')),
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

test('validateTapStack rejects unrelated firewall policy resources when the scenario expects Front Door WAF', () => {
  const scenario = {
    prompt: 'Use Azure Front Door with a Front Door WAF policy.',
    resourceNames: {
      resourceGroup: 'rg-frontdoor-waf',
      frontDoorWaf: 'waf-frontdoor-sample',
    },
    expectedOutputKeys: ['FrontDoorHostName'],
    requiredSourceMarkers: ['frontdoor.Policy'],
    forbiddenSourceMarkers: [],
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
    '  new azure.network.FirewallPolicy("waf", {',
    '    firewallPolicyName: "waf-frontdoor-sample",',
    '    resourceGroupName: "rg-frontdoor-waf",',
    '    location: "global",',
    '  });',
    '  return { FrontDoorHostName };',
    '}',
  ].join('\n');

  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /Front Door WAF scenarios must declare a Front Door WAF policy resource\.|missing scenario marker frontdoor\.policy/i,
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
    '  const privateZone = new azure.network.PrivateZone("private.internal", {',
    '    resourceGroupName: "rg-example",',
    '    privateZoneName: "private.internal",',
    '    location: "global",',
    '  });',
    '  new azure.network.RecordSet("public", {',
    '    resourceGroupName: "rg-example",',
    '    zoneName: "public.example.com",',
    '    relativeRecordSetName: "api",',
    '    recordType: "CNAME",',
    '    ttl: 300,',
    '    cnameRecord: { cname: "origin.example.net" },',
    '  });',
    '  new azure.network.PrivateRecordSet("private", {',
    '    resourceGroupName: "rg-example",',
    '    privateZoneName: privateZone.name,',
    '    relativeRecordSetName: "api",',
    '    recordType: "A",',
    '    ttl: 300,',
    '    aRecords: [{ ipv4Address: "10.0.0.10" }],',
    '  }, { dependsOn: [privateZone] });',
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

test('validateTapStack accepts azure.monitor alerting resources in Front Door WAF scenarios', () => {
  const scenario = {
    prompt: 'Use Azure Front Door with a Front Door WAF policy, action group, metric alert, and activity log alert.',
    resourceNames: {
      resourceGroup: 'rg-frontdoor-monitor',
      frontDoorWaf: 'waf-frontdoor-monitor',
    },
    expectedOutputKeys: ['ExampleOutput'],
    requiredSourceMarkers: ['frontdoor.Policy', 'monitor.ActionGroup', 'monitor.MetricAlert', 'monitor.ActivityLogAlert'],
    forbiddenSourceMarkers: [],
    integrationChecks: [
      {
        expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies',
      },
    ],
  };

  const tapStack = `
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";

export function createTapStack() {
  const actionGroup = new azure.monitor.ActionGroup("ag-frontdoor-monitor", {
    actionGroupName: "ag-frontdoor-monitor",
    resourceGroupName: "rg-frontdoor-monitor",
    location: "global",
    groupShortName: "fdmon",
    enabled: true,
  });
  new networkv20240201.Policy("waf-frontdoor-monitor", {
    policyName: "waf-frontdoor-monitor",
    resourceGroupName: "rg-frontdoor-monitor",
    location: "global",
    policySettings: { enabledState: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
    sku: { name: "Premium_AzureFrontDoor" },
  });
  new azure.monitor.MetricAlert("ma-frontdoor-monitor", {
    ruleName: "ma-frontdoor-monitor",
    resourceGroupName: "rg-frontdoor-monitor",
    location: "global",
    enabled: true,
    severity: 3,
    scopes: ["/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-frontdoor-monitor/providers/Microsoft.Network/frontDoorWebApplicationFirewallPolicies/waf-frontdoor-monitor"],
    evaluationFrequency: "PT5M",
    windowSize: "PT5M",
    criteria: { allOf: [] },
    actions: [{ actionGroupId: actionGroup.id }],
  });
  new azure.monitor.ActivityLogAlert("ala-frontdoor-monitor", {
    activityLogAlertName: "ala-frontdoor-monitor",
    resourceGroupName: "rg-frontdoor-monitor",
    location: "global",
    enabled: true,
    scopes: ["/subscriptions/00000000-0000-0000-0000-000000000000"],
    condition: { allOf: [{ field: "category", equals: "Administrative" }] },
    actions: { actionGroups: [{ actionGroupId: actionGroup.id }] },
  });
  const ExampleOutput = "ok";
  return { ExampleOutput };
}
`;

  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack rejects application gateway subnet ids derived from virtualNetwork.subnets.apply', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91049');
  assert.ok(scenario);
  const tapStack = `
import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";
// frontdoor.Policy cdn. managedidentity. containerregistry. network.PublicIPAddress network.VirtualNetwork network.ApplicationGateway containerservice. apimanagement. storage.BlobContainer servicebus. eventgrid. keyvault. appconfiguration. monitor.ActionGroup monitor.MetricAlert monitor.ActivityLogAlert operationalinsights.
// east-rollout-origin west-rollout-origin rollout-mesh-route rollout-mesh-security-policy waf-rollout-mesh-91049 rollout91049.contoso.net api id-rollout-mesh-91049 acrrolloutmesh91049 vnet-rollout-west-91049 snet-rollout-agw-west-91049 snet-rollout-aks-east-91049 snet-rollout-aks-west-91049 pip-rollout-east-91049 pip-rollout-west-91049 agw-rollout-west-91049 aks-rollout-east-91049 aks-rollout-west-91049 apim-rollout-mesh-91049 rollout-mesh-api rollout-mesh-product promote-model azrollout91049 model-artifacts sb-rollout-mesh-91049 model-rollouts east west rollback eg-rollout-mesh-91049 kv-rollout-mesh-91049 cfg-rollout-mesh-91049 ag-rollout-mesh-91049 ma-rollout-mesh-91049 ala-rollout-mesh-91049 log-rollout-east-91049 log-rollout-west-91049 appi-rollout-mesh-91049

export function createTapStack() {
  new networkv20240201.Policy("waf-rollout-mesh-91049", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    policyName: "waf-rollout-mesh-91049",
    location: "global",
    policySettings: { enabledState: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
    sku: { name: "Premium_AzureFrontDoor" },
  });
  const vnet = new azure.network.VirtualNetwork("vnet-rollout-east-91049", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    virtualNetworkName: "vnet-rollout-east-91049",
    location: "eastus",
    addressSpace: { addressPrefixes: ["10.10.0.0/16"] },
    subnets: [{ name: "snet-rollout-agw-east-91049", addressPrefix: "10.10.1.0/24" }],
  });
  const subnetId = vnet.subnets.apply(items => items?.[0]?.id ?? "");
  const privateZone = new azure.network.PrivateZone("rollout91049.internal", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    privateZoneName: "rollout91049.internal",
    location: "global",
  });
  new azure.network.Zone("rollout91049.contoso.net", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    zoneName: "rollout91049.contoso.net",
    location: "global",
  });
  new azure.network.RecordSet("api.rollout91049.contoso.net", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    zoneName: "rollout91049.contoso.net",
    relativeRecordSetName: "api",
    recordType: "CNAME",
    ttl: 300,
    cnameRecord: { cname: "rollout-mesh-endpoint.azurefd.net" },
  });
  new azure.network.PrivateRecordSet("api.rollout91049.internal", {
    resourceGroupName: "rg-az-rollout-mesh-pulumi-91049",
    privateZoneName: privateZone.name,
    relativeRecordSetName: "api",
    recordType: "A",
    ttl: 300,
    aRecords: [{ ipv4Address: "10.10.1.10" }],
  }, { dependsOn: [privateZone] });
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

test('validateTapStack rejects dns and privatedns module usage in Azure Native 2.x bundles', () => {
  const scenario = {
    prompt: 'Use one public DNS zone and one private DNS zone',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['frontdoor.Policy', 'dns.RecordSet', 'privatedns.PrivateRecordSet'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' }],
  };
  const tapStack = `
import * as network from "@pulumi/azure-native/network";
import * as dns from "@pulumi/azure-native/dns";
import * as privatedns from "@pulumi/azure-native/privatedns";
import * as pulumi from "@pulumi/pulumi";
// dns.RecordSet privatedns.PrivateRecordSet

export function createTapStack() {
  const privateZone = new network.PrivateZone("edge91051.internal", {
    resourceGroupName: "rg",
    privateZoneName: "edge91051.internal",
    location: "global",
  });
  new network.Zone("edge91051.contoso.net", {
    resourceGroupName: "rg",
    zoneName: "edge91051.contoso.net",
    location: "global",
  });
  new dns.RecordSet("api.edge91051.contoso.net", {
    resourceGroupName: "rg",
    zoneName: "edge91051.contoso.net",
    relativeRecordSetName: "api-dns",
    recordType: "CNAME",
    ttl: 300,
    cnameRecord: { cname: "edge.azurefd.net" },
  });
  new network.RecordSet("api.edge91051.contoso.net", {
    resourceGroupName: "rg",
    zoneName: "edge91051.contoso.net",
    relativeRecordSetName: "api",
    recordType: "CNAME",
    ttl: 300,
    cnameRecord: { cname: "edge.azurefd.net" },
  });
  new privatedns.PrivateRecordSet("api.edge91051.internal", {
    resourceGroupName: "rg",
    privateZoneName: "edge91051.internal",
    relativeRecordSetName: "api-dns",
    recordType: "A",
    ttl: 300,
    aRecords: [{ ipv4Address: "10.0.0.11" }],
  }, { dependsOn: [privateZone] });
  new network.PrivateRecordSet("api.edge91051.internal", {
    resourceGroupName: "rg",
    privateZoneName: privateZone.name,
    relativeRecordSetName: "api",
    recordType: "A",
    ttl: 300,
    aRecords: [{ ipv4Address: "10.0.0.10" }],
  }, { dependsOn: [privateZone] });
  return {};
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /This bundle uses the Azure Native 2.x surface\. Use azure\.network\.Zone and azure\.network\.RecordSet for public DNS, and use azure\.network\.PrivateZone, azure\.network\.VirtualNetworkLink, and azure\.network\.PrivateRecordSet for private DNS\./,
  );
});

test('validateTapStack accepts azure.network DNS resources in Front Door WAF scenarios on the Azure Native 2.x surface', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91051');
  assert.ok(scenario);
  const tapStack = `
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";
// frontdoor.Policy network.VirtualNetwork app.ManagedEnvironment app.ContainerApp servicebus. storage.BlobContainer storage.FileShare eventgrid. keyvault. appconfiguration. insights.ActionGroup insights.MetricAlert insights.ActivityLogAlert operationalinsights. edge-commands replay audit
// afd-private-edge-91051 private-edge-endpoint private-edge-origins private-edge-origin-east private-edge-origin-west private-edge-route private-edge-security-policy waf-private-edge-91051 edge91051.contoso.net api ops edge91051.internal edge-link-east-91051 edge-link-west-91051 vnet-edge-east-91051 vnet-edge-west-91051 cae-edge-east-91051 cae-edge-west-91051 ca-edge-api-east-91051 ca-edge-api-west-91051 ca-edge-worker-east-91051 ca-edge-worker-west-91051 ca-edge-supervisor-91051 sb-private-edge-91051 edge-commands east west replay audit azprivateedge91051 edge-drop edge-archive edge-files eg-private-edge-91051 kv-private-edge-91051 cfg-private-edge-91051 ag-private-edge-91051 ma-private-edge-91051 ala-private-edge-91051 log-private-edge-east-91051 log-private-edge-west-91051 appi-private-edge-91051

export function createTapStack() {
  new networkv20240201.Policy("waf-private-edge-91051", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", policyName: "waf-private-edge-91051", location: "global", policySettings: { enabledState: "Enabled", mode: "Prevention", requestBodyCheck: "Enabled" }, managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] }, sku: { name: "Premium_AzureFrontDoor" } });
  new azure.network.Zone("edge91051.contoso.net", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", zoneName: "edge91051.contoso.net", location: "global" });
  new azure.network.RecordSet("api", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", zoneName: "edge91051.contoso.net", relativeRecordSetName: "api", recordType: "CNAME", ttl: 300, cnameRecord: { cname: "edge.azurefd.net" } });
  const privateZone = new azure.network.PrivateZone("edge91051.internal", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", privateZoneName: "edge91051.internal", location: "global" });
  const eastVnet = { id: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet-edge-east-91051" } as any;
  new azure.network.VirtualNetworkLink("edge-link-east-91051", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", privateZoneName: privateZone.name, virtualNetworkLinkName: "edge-link-east-91051", location: "global", virtualNetwork: { id: eastVnet.id }, registrationEnabled: false }, { dependsOn: [privateZone, eastVnet] });
  new azure.network.PrivateRecordSet("api.edge91051.internal", { resourceGroupName: "rg-az-private-edge-fabric-pulumi-91051", privateZoneName: privateZone.name, relativeRecordSetName: "api", recordType: "A", ttl: 300, aRecords: [{ ipv4Address: "10.0.0.10" }] }, { dependsOn: [privateZone] });
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
  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack accepts Azure Native private DNS submodule imports', () => {
  const scenario = {
    prompt: 'Use one private DNS zone and link both regional virtual networks.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['frontdoor.Policy', 'privatedns.PrivateZone'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' }],
  };
  const tapStack = `
import * as privatedns from "@pulumi/azure-native/privatedns";
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";

export function createTapStack() {
  new networkv20240201.Policy("waf-sample", {
    resourceGroupName: "rg-example",
    policyName: "waf-sample",
    location: "global",
    policySettings: { enabledState: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
    sku: { name: "Premium_AzureFrontDoor" },
  });
  new privatedns.PrivateZone("example.internal", {
    privateZoneName: "example.internal",
    resourceGroupName: "rg-example",
    location: "global",
  });
  return {};
}
`;
  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack accepts azure.network public DNS resources when the scenario uses the Azure Native 2.x surface', () => {
  const scenario = {
    prompt: 'Use one public DNS zone and one A record.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['network.Zone', 'network.RecordSet'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ typePath: 'dnsZones/example.contoso.net/A/east' }],
  };
  const tapStack = `
import * as azure from "@pulumi/azure-native";

export function createTapStack() {
  new azure.network.Zone("example.contoso.net", {
    resourceGroupName: "rg-example",
    zoneName: "example.contoso.net",
    location: "global",
  });
  new azure.network.RecordSet("east", {
    resourceGroupName: "rg-example",
    zoneName: "example.contoso.net",
    relativeRecordSetName: "east",
    recordType: "A",
    ttl: 60,
    aRecords: [{ ipv4Address: "10.0.0.4" }],
  });
  return {};
}
`;
  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack rejects top-level azure.network.WebApplicationFirewallPolicy in Front Door scenarios', () => {
  const scenario = {
    prompt: 'Use one Front Door WAF policy and one security policy.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['frontdoor.Policy'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' }],
  };
  const tapStack = `
import * as azure from "@pulumi/azure-native";

export function createTapStack() {
  new azure.network.WebApplicationFirewallPolicy("waf-sample", {
    resourceGroupName: "rg-example",
    policyName: "waf-sample",
    location: "global",
    policySettings: { state: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
  });
  return {};
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /must use @pulumi\/azure-native\/network\/v20240201 Policy/i,
  );
});

test('validateTapStack rejects Front Door WAF versioned Policy payloads cast with as any', () => {
  const scenario = {
    prompt: 'Use one Front Door WAF policy and one security policy.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['frontdoor.Policy'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' }],
  };
  const tapStack = `
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";

export function createTapStack() {
  new networkv20240201.Policy("waf-sample", {
    resourceGroupName: "rg-example",
    policyName: "waf-sample",
    location: "global",
    sku: { name: "Premium_AzureFrontDoor" },
    policySettings: { enabledState: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
  } as any);
  return {};
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /must not cast network\/v20240201 Policy payloads with "as any"/i,
  );
});

test('validateTapStack rejects legacy Front Door WAF classes and RouteArgs.origins in Front Door scenarios', () => {
  const scenario = {
    prompt: 'Use one Front Door WAF policy and one route.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['frontdoor.Policy'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' }],
  };
  const tapStack = `
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";

export function createTapStack() {
  const endpoint = new azure.cdn.AFDEndpoint("endpoint", {
    endpointName: "endpoint",
    profileName: "profile",
    resourceGroupName: "rg-example",
    location: "global",
    enabledState: "Enabled",
  });
  new networkv20240201.Policy("typed-waf", {
    resourceGroupName: "rg-example",
    policyName: "typed-waf",
    location: "global",
    policySettings: { enabledState: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
    sku: { name: "Premium_AzureFrontDoor" },
  });
  new azure.network.FrontDoorWebApplicationFirewallPolicy("waf-sample", {
    policyName: "waf-sample",
    resourceGroupName: "rg-example",
    location: "global",
  } as any);
  new azure.cdn.Route("route", {
    routeName: "route",
    endpointName: "endpoint",
    profileName: "profile",
    resourceGroupName: "rg-example",
    origins: [{ id: endpoint.id }],
    patternsToMatch: ["/*"],
    supportedProtocols: ["Http", "Https"],
    forwardingProtocol: "MatchRequest",
    httpsRedirect: "Enabled",
    linkToDefaultDomain: "Enabled",
    enabledState: "Enabled",
  } as any);
  return {};
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /must use @pulumi\/azure-native\/network\/v20240201 Policy|RouteArgs must use originGroup, not origins/i,
  );
});

test('validateTapStack accepts typed Front Door WAF payloads that use the versioned Policy surface', () => {
  const scenario = {
    prompt: 'Use one Front Door WAF policy and one security policy.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['frontdoor.Policy'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ expectedType: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' }],
  };
  const tapStack = `
import * as azure from "@pulumi/azure-native";
import * as networkv20240201 from "@pulumi/azure-native/network/v20240201";

export function createTapStack() {
  new networkv20240201.Policy("waf-sample", {
    resourceGroupName: "rg-example",
    policyName: "waf-sample",
    location: "global",
    policySettings: { enabledState: "Enabled", mode: "Prevention" },
    managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] },
    sku: { name: "Premium_AzureFrontDoor" },
  });
  return {};
}
  `;
  assert.doesNotThrow(() => validateTapStack(scenario, tapStack));
});

test('validateTapStack rejects WorkspaceResourceId casing on Application Insights components', () => {
  const scenario = {
    prompt: 'Use one Application Insights component and one Log Analytics workspace.',
    resourceNames: {},
    expectedOutputKeys: [],
    requiredSourceMarkers: ['applicationinsights.Component', 'operationalinsights.'],
    forbiddenSourceMarkers: [],
    integrationChecks: [],
  };
  const tapStack = `
import * as azure from "@pulumi/azure-native";

export function createTapStack() {
  const workspace = new azure.operationalinsights.Workspace("log", {
    resourceGroupName: "rg-example",
    workspaceName: "log-example",
    location: "eastus",
    sku: { name: "PerGB2018" },
  });
  new azure.insights.Component("appi", {
    resourceGroupName: "rg-example",
    resourceName: "appi",
    location: "eastus",
    kind: "web",
    applicationType: "web",
    WorkspaceResourceId: workspace.id,
  });
  return {};
}
`;
  assert.throws(
    () => validateTapStack(scenario, tapStack),
    /use workspaceResourceId, not WorkspaceResourceId/i,
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

test('Pr91056 includes both regional AKS clusters and Front Door security policy checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91056');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-serving-east-91056'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-serving-west-91056'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-global-serving-91056/securityPolicies/global-serving-security-policy'),
  );
});

test('Pr91057 private DNS record checks use relative private record names', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91057');
  assert.ok(scenario);
  const gatewayRecord = scenario.integrationChecks.find((check) => check.label === 'private-gateway-record');
  const workersRecord = scenario.integrationChecks.find((check) => check.label === 'private-workers-record');
  const filesRecord = scenario.integrationChecks.find((check) => check.label === 'private-files-record');
  assert.equal(gatewayRecord.typePath, 'privateDnsZones/mesh91057.internal/A/gateway');
  assert.equal(workersRecord.typePath, 'privateDnsZones/mesh91057.internal/A/workers');
  assert.equal(filesRecord.typePath, 'privateDnsZones/mesh91057.internal/A/files');
});

test('Pr91058 includes both regional IoT hubs and the Synapse SQL pool check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91058');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-fusion-east-91058'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-iot-hub'
      && check.typePath === 'IotHubs/iot-fusion-west-91058'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-digital-fusion-91058/sqlPools/fusionpool'),
  );
});

test('Pr91059 includes both DMS projects and the approve-cutover policy check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91059');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-governance-91059/projects/mysql-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-cutover-governance-91059/projects/postgres-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-approve-policy'
      && check.typePath === 'service/apim-cutover-governance-91059/apis/cutover-governance-api/operations/approve-cutover/policies/policy'),
  );
});

test('Pr91060 includes both regional Event Hubs and the escalation subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91060');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-event-hub'
      && check.typePath === 'namespaces/eh-replay-east-91060/eventhubs/replay-events-east'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-replay-west-91060/eventhubs/replay-events-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-escalation'
      && check.typePath === 'namespaces/sb-replay-anomaly-91060/topics/replay-events/subscriptions/escalation'),
  );
});

test('Pr91061 includes dual function apps and the replay operation check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91061');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-function-app'
      && check.typePath === 'sites/func-triage-east-91061'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-function-app'
      && check.typePath === 'sites/func-triage-west-91061'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-acknowledge-operation'
      && check.typePath === 'service/apim-global-triage-91061/apis/triage-control-api/operations/acknowledge-replay'),
  );
});

test('Pr91062 includes bidirectional vnet peerings and the sync private record', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91062');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-peering'
      && check.typePath === 'virtualNetworks/vnet-regmesh-east-91062/virtualNetworkPeerings/peer-east-to-west-91062'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-peering'
      && check.typePath === 'virtualNetworks/vnet-regmesh-west-91062/virtualNetworkPeerings/peer-west-to-east-91062'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-sync-record'
      && check.typePath === 'privateDnsZones/mesh91062.internal/A/sync'),
  );
});

test('Pr91063 includes Digital Twins and both regional IoT hubs', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91063');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-fleet-command-91063'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-fleet-east-91063'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-iot-hub'
      && check.typePath === 'IotHubs/iot-fleet-west-91063'),
  );
});

test('Pr91064 includes both DMS projects and the approvals subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91064');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-governed-cutover-91064/projects/postgres-wave-a'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-governed-cutover-91064/projects/mysql-wave-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approvals'
      && check.typePath === 'namespaces/sb-governed-cutover-91064/topics/cutover-governance/subscriptions/approvals'),
  );
});

test('Pr91065 includes Synapse, Cosmos, and the escalation subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91065');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-reg-replay-91065/sqlPools/regreplaypool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-reg-replay-91065/sqlDatabases/ReplayAuditDb/containers/ReplayAudit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-escalation'
      && check.typePath === 'namespaces/sb-reg-replay-91065/topics/reg-replay-events/subscriptions/escalation'),
  );
});

test('Pr91066 includes Front Door security policy, both DMS projects, and the rollback operation policy', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91066');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-cutover-governance-91066/securityPolicies/cutover-governance-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-governance-91066/projects/mysql-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-cutover-governance-91066/projects/postgres-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-rollback-policy'
      && check.typePath === 'service/apim-cutover-governance-91066/apis/cutover-governance-api/operations/rollback-cutover/policies/policy'),
  );
});

test('Pr91067 includes dual AKS clusters, a private registry record, and the rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91067');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-release-east-91067'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-release-west-91067'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-registry-record'
      && check.typePath === 'privateDnsZones/release91067.internal/A/registry'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-release-command-91067/topics/release-rollouts/subscriptions/rollback'),
  );
});

test('Pr91068 includes dual managed environments, both regional event hubs, and the private events record', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91068');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-signal-east-91068'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-event-hub'
      && check.typePath === 'namespaces/eh-signal-east-91068/eventhubs/signal-east'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-signal-west-91068/eventhubs/signal-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-events-record'
      && check.typePath === 'privateDnsZones/signal91068.internal/A/events'),
  );
});

test('Pr91069 includes both IoT Hubs, Digital Twins, Logic App, and the incident subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91069');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-fleet-east-91069'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-iot-hub'
      && check.typePath === 'IotHubs/iot-fleet-west-91069'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-fleet-governor-91069'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'workflow'
      && check.typePath === 'workflows/la-fleet-governor-91069'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-incident'
      && check.typePath === 'namespaces/sb-fleet-governor-91069/topics/fleet-commands/subscriptions/incident'),
  );
});

test('Pr91070 includes Synapse, DMS, Cosmos SQL, and the MySQL database', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91070');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-reg-reconcile-91070/sqlPools/regreconcilepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project'
      && check.typePath === 'services/dms-reg-reconcile-91070/projects/mysql-reconciliation-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-reg-reconcile-91070/sqlDatabases/ReconcileStateDb/containers/ReconcileState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-reg-reconcile-91070/databases/reconciledb'),
  );
});

test('Pr91071 includes dual AKS, dual application gateways, and the rollback ring policy', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91071');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-release-east-91071'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-application-gateway'
      && check.typePath === 'applicationGateways/agw-release-west-91071'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-rollback-policy'
      && check.typePath === 'service/apim-release-ring-91071/apis/release-ring-api/operations/rollback-ring/policies/policy'),
  );
});

test('Pr91072 includes both DMS projects, both database engines, and the execution subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91072');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-spine-91072/projects/mysql-cutover-spine-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-cutover-spine-91072/projects/postgres-cutover-spine-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-cutover-spine-91072/databases/cutoverledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-execution'
      && check.typePath === 'namespaces/sb-cutover-spine-91072/topics/cutover-spine-events/subscriptions/execution'),
  );
});

test('Pr91073 includes both IoT hubs, Digital Twins, and the incident subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91073');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-industrial-east-91073'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-industrial-fabric-91073'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-incident'
      && check.typePath === 'namespaces/sb-industrial-fabric-91073/topics/industrial-commands/subscriptions/incident'),
  );
});

test('Pr91074 includes dual managed environments, dual application gateways, and the replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91074');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-private-east-91074'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-application-gateway'
      && check.typePath === 'applicationGateways/agw-private-west-91074'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-private-grid-91074/topics/private-commands/subscriptions/replay'),
  );
});

test('Pr91075 includes Synapse, Cosmos, both DMS projects, and the escalation subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91075');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-reconcile-graph-91075/sqlPools/reconcilegraphpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-reconcile-graph-91075/sqlDatabases/ReconcileGraphDb/containers/ReconcileGraph'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-reconcile-graph-91075/projects/postgres-reconcile-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-escalation'
      && check.typePath === 'namespaces/sb-reconcile-graph-91075/topics/reconcile-graph-events/subscriptions/escalation'),
  );
});

test('Pr91076 includes dual IoT hubs, Digital Twins, Cosmos, and Synapse checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91076');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-safety-east-91076'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-safety-fabric-91076'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-safety-fabric-91076/sqlDatabases/SafetyTwinDb/containers/SafetyState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-safety-fabric-91076/sqlPools/safetytwinpool'),
  );
});

test('Pr91077 includes Front Door, dual container environments, and the approve subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91077');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-container-governance-91077/securityPolicies/container-governance-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-gov-east-91077'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-container-governance-91077/topics/container-governance-events/subscriptions/approve'),
  );
});

test('Pr91078 includes private DNS, both DMS projects, and both relational engines', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91078');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-zone'
      && check.typePath === 'privateDnsZones/modernize91078.internal'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-modernization-tower-91078/projects/mysql-modernization-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-modernization-91078/databases/modernizationdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-modernization-91078/databases/modernizationledger'),
  );
});

test('Pr91079 includes dual AKS clusters, private DNS records, and the dispatch subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91079');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-mesh-east-91079'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-files-record'
      && check.typePath === 'privateDnsZones/mesh91079.internal/A/files'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch'
      && check.typePath === 'namespaces/sb-private-mesh-91079/topics/private-mesh-events/subscriptions/dispatch'),
  );
});

test('Pr91080 includes Synapse, Cosmos, both DMS projects, and the escalation subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-warehouse-orchestrator-91080/sqlPools/warehousepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-warehouse-orchestrator-91080/sqlDatabases/WarehouseStateDb/containers/WarehouseState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-warehouse-orchestrator-91080/projects/postgres-warehouse-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-escalation'
      && check.typePath === 'namespaces/sb-warehouse-orchestrator-91080/topics/warehouse-orchestrator-events/subscriptions/escalation'),
  );
});

test('Pr91081 includes Front Door, private DNS, PostgreSQL, and the regulatory subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91081');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-pharma-response-91081/securityPolicies/pharma-response-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-zone'
      && check.typePath === 'privateDnsZones/pharma91081.internal'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-pharma-response-91081/databases/pharmacovigilance'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-regulatory'
      && check.typePath === 'namespaces/sb-pharma-response-91081/topics/pharma-response-events/subscriptions/regulatory'),
  );
});

test('Pr91082 includes dual AKS clusters, private DNS, and the shadow subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91082');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-model-east-91082'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-model-west-91082'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-registry-record'
      && check.typePath === 'privateDnsZones/modelring91082.internal/A/registry'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-shadow'
      && check.typePath === 'namespaces/sb-model-ring-91082/topics/model-ring-events/subscriptions/shadow'),
  );
});

test('Pr91083 includes dual IoT hubs, Digital Twins, Cosmos, and the escalation subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91083');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-maint-east-91083'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-asset-maintenance-91083'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-asset-maintenance-91083/sqlDatabases/MaintenanceDb/containers/MaintenanceState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-escalation'
      && check.typePath === 'namespaces/sb-asset-maintenance-91083/topics/asset-maintenance-events/subscriptions/escalation'),
  );
});

test('Pr91084 includes private DNS, both DMS projects, and both relational engines', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91084');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-zone'
      && check.typePath === 'privateDnsZones/cutover91084.internal'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-ring-91084/projects/mysql-cutover-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-cutover-ring-91084/databases/cutoverdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-cutover-ring-91084/databases/cutoverledger'),
  );
});

test('Pr91085 includes Front Door, dual managed environments, and the admit subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91085');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-tenant-fabric-91085/securityPolicies/tenant-fabric-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-tenant-east-91085'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-admit'
      && check.typePath === 'namespaces/sb-tenant-fabric-91085/topics/tenant-fabric-events/subscriptions/admit'),
  );
});

test('Pr91086 includes Front Door, dual AKS clusters, and the clearing subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91086');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-fraud-east-91086'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'redis-cache'
      && check.typePath === 'Redis/redis-fraud-mesh-91086'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-clearing'
      && check.typePath === 'namespaces/sb-fraud-mesh-91086/topics/fraud-decisions/subscriptions/clearing'),
  );
});

test('Pr91087 includes Front Door, dual managed environments, and the pack subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91087');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-fulfill-east-91087'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-orders-app'
      && check.typePath === 'containerApps/ca-fulfill-orders-east-91087'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-pack'
      && check.typePath === 'namespaces/sb-fulfillment-fabric-91087/topics/fulfillment-events/subscriptions/pack'),
  );
});

test('Pr91088 includes private DNS, Synapse, Cosmos, and the warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91088');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-zone'
      && check.typePath === 'privateDnsZones/ledger91088.internal'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-ledger-warehouse-91088/sqlPools/ledgerpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-ledger-warehouse-91088/sqlDatabases/LedgerStateDb/containers/LedgerState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-ledger-warehouse-91088/topics/ledger-events/subscriptions/warehouse'),
  );
});

test('Pr91089 includes private DNS, both DMS projects, both relational engines, and Redis', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91089');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-zone'
      && check.typePath === 'privateDnsZones/migrate91089.internal'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-migration-arbitration-91089/projects/postgres-arbitration-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-migration-arbitration-91089/databases/arbitrationdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'redis-cache'
      && check.typePath === 'Redis/redis-migration-arbitration-91089'),
  );
});

test('Pr91090 includes IoT hubs, Digital Twins, Synapse, and the investigate subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91090');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-command-east-91090'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-command-ring-91090'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-command-ring-91090/sqlPools/commandpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-investigate'
      && check.typePath === 'namespaces/sb-command-ring-91090/topics/command-events/subscriptions/investigate'),
  );
});

test('Pr91091 includes PostgreSQL, workflow, function app, and the release subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91091');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('logic.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/la-clinical-release-91091'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'function-app'
      && check.typePath === 'sites/func-clinical-release-91091'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-clinical-release-91091/databases/releaseledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-release'
      && check.typePath === 'namespaces/sb-clinical-release-91091/topics/clinical-events/subscriptions/release'),
  );
});

test('Pr91092 includes Front Door, managed identity, registry, dual managed environments, and the delivery subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91092');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-media-admission-91092/securityPolicies/media-admission-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-media-east-91092'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-media-west-91092'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-delivery'
      && check.typePath === 'namespaces/sb-media-admission-91092/topics/media-events/subscriptions/delivery'),
  );
});

test('Pr91093 includes Front Door, Synapse, Cosmos, and the warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91093');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-claims-analytics-91093/sqlPools/claimspool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-claims-analytics-91093/sqlDatabases/ClaimsStateDb/containers/ClaimsState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-claims-analytics-91093/topics/claims-events/subscriptions/warehouse'),
  );
});

test('Pr91094 includes Front Door, both DMS projects, both relational engines, and Redis', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91094');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-mysql-project'
      && check.typePath === 'services/dms-sovereign-cutover-91094/projects/mysql-sovereign-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-postgres-project'
      && check.typePath === 'services/dms-sovereign-cutover-91094/projects/postgres-sovereign-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-sovereign-cutover-91094/databases/cutoverdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-sovereign-cutover-91094/databases/cutoverledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'redis-cache'
      && check.typePath === 'Redis/redis-sovereign-cutover-91094'),
  );
});

test('Pr91095 includes Front Door, both IoT hubs, Digital Twins, and the investigate subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91095');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-plant-east-91095'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-iot-hub'
      && check.typePath === 'IotHubs/iot-plant-west-91095'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-plant-thread-91095'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-investigate'
      && check.typePath === 'namespaces/sb-plant-thread-91095/topics/plant-events/subscriptions/investigate'),
  );
});

test('Pr91096 includes Front Door, dual AKS clusters, and the resume subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91096');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-robotics-east-91096'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-robotics-west-91096'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-resume-policy'
      && check.typePath === 'service/apim-robotics-ring-91096/apis/robotics-ring-api/operations/resume-mission/policies/policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-resume'
      && check.typePath === 'namespaces/sb-robotics-ring-91096/topics/robotics-commands/subscriptions/resume'),
  );
});

test('Pr91097 includes Front Door, Synapse, Cosmos, and the replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91097');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('documentdb.'));
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmos-claims-lattice-91097/sqlDatabases/ClaimsReplayDb/containers/ReplayState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-claims-lattice-91097/sqlPools/claimspool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-claims-lattice-91097/topics/claims-events/subscriptions/replay'),
  );
});

test('Pr91098 includes dual IoT hubs, Digital Twins, and the resume subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91098');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-store-east-91098'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-store-twin-91098'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-resume'
      && check.typePath === 'namespaces/sb-store-twin-91098/topics/store-commands/subscriptions/resume'),
  );
});

test('Pr91099 includes DMS service, both relational engines, and the rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91099');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-rollback-project'
      && check.typePath === 'services/dms-cutover-mesh-91099/projects/rollback-rehearsal'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-cutover-mesh-91099/databases/ledgerdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-cutover-mesh-91099/topics/cutover-commands/subscriptions/rollback'),
  );
});

test('Pr91100 includes Front Door, dual managed environments, and the drift subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91100');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-release-east-91100'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-release-west-91100'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-drift'
      && check.typePath === 'namespaces/sb-release-lattice-91100/topics/release-events/subscriptions/drift'),
  );
});

test('Pr91101 includes Front Door, PostgreSQL, and the finance subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91101');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-exception-ring-91101/securityPolicies/exception-ring-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-exception-ring-91101/databases/exceptionsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-finance'
      && check.typePath === 'namespaces/sb-exception-ring-91101/topics/exception-events/subscriptions/finance'),
  );
});

test('Pr91102 includes Synapse, Event Hubs, and the warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91102');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('eventhub.'));
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'event-hub'
      && check.typePath === 'namespaces/eh-anomaly-fabric-91102/eventhubs/anomaly-stream'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-anomaly-fabric-91102/sqlPools/anomalypool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-anomaly-fabric-91102/topics/anomaly-events/subscriptions/warehouse'),
  );
});

test('Pr91103 includes both AKS clusters, the private registry record, and the canary subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91103');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('privatedns.PrivateZone'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-release-east-91103'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-release-west-91103'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-registry-record'
      && check.typePath === 'privateDnsZones/release91103.internal/A/registry'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-canary'
      && check.typePath === 'namespaces/sb-release-governance-91103/topics/release-governance/subscriptions/canary'),
  );
});

test('Pr91104 includes both IoT hubs, Digital Twins, and the restore subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91104');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-remediation-east-91104'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins'
      && check.typePath === 'digitalTwinsInstances/adt-remediation-thread-91104'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-restore'
      && check.typePath === 'namespaces/sb-remediation-thread-91104/topics/remediation-commands/subscriptions/restore'),
  );
});

test('Pr91105 includes Queue Storage, Table Storage, PostgreSQL, and the approvals subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91105');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('storage.Queue'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.Table'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-queue'
      && check.typePath === 'storageAccounts/azreview91105/queueServices/default/queues/review-jobs'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-table'
      && check.typePath === 'storageAccounts/azreview91105/tableServices/default/tables/batchstatus'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-review-plane-91105/databases/reviewdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approvals'
      && check.typePath === 'namespaces/sb-review-plane-91105/topics/review-events/subscriptions/approvals'),
  );
});

test('Pr91106 includes Front Door, both DMS engines, and the rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91106');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-rollback-project'
      && check.typePath === 'services/dms-cutover-fabric-91106/projects/rollback-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-cutover-fabric-91106/databases/ledgerdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-cutover-fabric-91106/topics/cutover-events/subscriptions/rollback'),
  );
});

test('Pr91107 includes IoT Hub, Digital Twins, Cosmos container, and the replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91107');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins'));
  assert.ok(scenario.requiredSourceMarkers.includes('documentdb.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmosfleet91107/sqlDatabases/FleetTwinDb/containers/TwinProjection'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-fleet-mesh-91107/sqlPools/fleetpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-fleet-mesh-91107/topics/fleet-events/subscriptions/replay'),
  );
});

test('Pr91108 includes Front Door, both managed environments, and the resume subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91108');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(scenario.requiredSourceMarkers.includes('app.ContainerApp'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-container-east-91108'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-container-west-91108'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-resume'
      && check.typePath === 'namespaces/sb-container-mesh-91108/topics/container-events/subscriptions/resume'),
  );
});

test('Pr91109 includes API Management, both relational databases, DMS, and the migration subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91109');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('apimanagement.'));
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-postgres-project'
      && check.typePath === 'services/dms-adjudication-91109/projects/postgres-review-sync'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-migration'
      && check.typePath === 'namespaces/sb-adjudication-91109/topics/adjudication-events/subscriptions/migration'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-queue'
      && check.typePath === 'storageAccounts/azadjudication91109/queueServices/default/queues/adjudication-jobs'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-table'
      && check.typePath === 'storageAccounts/azadjudication91109/tableServices/default/tables/adjudicationstatus'),
  );
});

test('Pr91110 includes both AKS clusters, Cosmos container, and the replicate subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91110');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('documentdb.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-claims-east-91110'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-claims-west-91110'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmosclaims91110/sqlDatabases/ClaimsDb/containers/ClaimsLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replicate'
      && check.typePath === 'namespaces/sb-claims-ring-91110/topics/claims-events/subscriptions/replicate'),
  );
});

test('Pr91111 includes both DMS engines, both relational databases, and the rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91111');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-rollback-project'
      && check.typePath === 'services/dms-trade-plane-91111/projects/rollback-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-trade-plane-91111/databases/tradedb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-trade-plane-91111/topics/trade-events/subscriptions/rollback'),
  );
});

test('Pr91112 includes both IoT hubs, the twin ledger container, and the warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91112');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins'));
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmosthread91112/sqlDatabases/FactoryThreadDb/containers/TwinLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'container-registry'
      && check.typePath === 'registries/acrthread91112'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-thread-plane-91112/topics/thread-events/subscriptions/warehouse'),
  );
});

test('Pr91113 includes both AKS clusters, the APIM reserve policy, and the ship subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91113');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('apimanagement.'));
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-fulfillment-east-91113'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-reserve-policy'
      && check.typePath === 'service/apim-fulfillment-mesh-91113/apis/fulfillment-mesh-api/operations/reserve-stock/policies/policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-ship'
      && check.typePath === 'namespaces/sb-fulfillment-mesh-91113/topics/fulfillment-events/subscriptions/ship'),
  );
});

test('Pr91114 includes both managed environments, the container apps, and the close subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91114');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(scenario.requiredSourceMarkers.includes('app.ContainerApp'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-container-app'
      && check.typePath === 'containerApps/ca-incident-east-91114'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-incident-west-91114'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-close'
      && check.typePath === 'namespaces/sb-incident-fabric-91114/topics/incident-events/subscriptions/close'),
  );
});

test('Pr91115 includes Synapse, both DMS engines, queue/table storage, and the reconcile subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91115');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.Queue'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.Table'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-replay-project'
      && check.typePath === 'services/dms-handoff-mesh-91115/projects/replay-handoff'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-table'
      && check.typePath === 'storageAccounts/azhandoff91115/tableServices/default/tables/handoffstatus'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-reconcile'
      && check.typePath === 'namespaces/sb-handoff-mesh-91115/topics/handoff-events/subscriptions/reconcile'),
  );
});

test('Pr91116 includes both AKS clusters, Cosmos, and the archive subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91116');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('documentdb.'));
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-claims-east-91116'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmosclaims91116/sqlDatabases/ClaimsDb/containers/ClaimsLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-archive'
      && check.typePath === 'namespaces/sb-claims-ring-91116/topics/claims-events/subscriptions/archive'),
  );
});

test('Pr91117 includes both managed environments, queue/table storage, and the carrier subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91117');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(scenario.requiredSourceMarkers.includes('storage.Queue'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-tenant-east-91117'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-table'
      && check.typePath === 'storageAccounts/aztenant91117/tableServices/default/tables/orderstatus'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-carrier'
      && check.typePath === 'namespaces/sb-tenant-mesh-91117/topics/orders-events/subscriptions/carrier'),
  );
});

test('Pr91118 includes both IoT hubs, the replay workflow, and the warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91118');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins'));
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-robotics-east-91118'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/la-robotics-replay-91118'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-robotics-replay-91118/topics/robotics-events/subscriptions/warehouse'),
  );
});

test('Pr91119 includes both relational engines, the replay DMS project, and the cutover queue/table', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91119');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-replay-project'
      && check.typePath === 'services/dms-cutover-arb-91119/projects/replay-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-queue'
      && check.typePath === 'storageAccounts/azcutover91119/queueServices/default/queues/cutover-jobs'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'storage-table'
      && check.typePath === 'storageAccounts/azcutover91119/tableServices/default/tables/cutoverstatus'),
  );
});

test('Pr91120 includes both managed environments, both event hubs, and the replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91120');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('network.LoadBalancer'));
  assert.ok(scenario.requiredSourceMarkers.includes('eventhub.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-dispatch-east-91120'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-dispatch-west-91120/eventhubs/dispatch-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-dispatch-signal-91120/topics/dispatch-events/subscriptions/replay'),
  );
});

test('Pr91121 includes Front Door, Function App, workflow, and the audit subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91121');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('web.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-route'
      && check.typePath === 'profiles/afd-payments-grid-91121/afdEndpoints/payments-grid-endpoint/routes/payments-grid-route'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'function-app'
      && check.typePath === 'sites/fn-payments-grid-91121'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/logic-payments-grid-91121'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-audit'
      && check.typePath === 'namespaces/sb-payments-grid-91121/topics/payments-events/subscriptions/audit'),
  );
});

test('Pr91122 includes both managed environments, both load balancers, and the reconcile subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91122');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('app.ManagedEnvironment'));
  assert.ok(scenario.requiredSourceMarkers.includes('network.LoadBalancer'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-branch-east-91122'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-branch-east-91122'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-load-balancer'
      && check.typePath === 'loadBalancers/lb-branch-west-91122'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-reconcile'
      && check.typePath === 'namespaces/sb-branch-reconcile-91122/topics/branch-events/subscriptions/reconcile'),
  );
});

test('Pr91123 includes both IoT hubs, Digital Twins, Synapse, and the replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91123');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('devices.'));
  assert.ok(scenario.requiredSourceMarkers.includes('digitaltwins'));
  assert.ok(scenario.requiredSourceMarkers.includes('synapse.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-robotics-east-91123'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/dt-robotics-91123'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-robotics-91123/sqlPools/roboticspool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-robotics-lattice-91123/topics/robotics-events/subscriptions/replay'),
  );
});

test('Pr91124 includes Front Door, both database engines, DMS projects, and the rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91124');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('frontdoor.Policy'));
  assert.ok(scenario.requiredSourceMarkers.includes('datamigration.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbformysql.'));
  assert.ok(scenario.requiredSourceMarkers.includes('dbforpostgresql.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-route'
      && check.typePath === 'profiles/afd-cutover-fabric-91124/afdEndpoints/cutover-fabric-endpoint/routes/cutover-fabric-route'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-cutover-91124/databases/cutoverdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-cutover-91124/databases/cutoverdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-reconciliation'
      && check.typePath === 'services/dms-cutover-fabric-91124/projects/reconciliation-project'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-cutover-fabric-91124/topics/cutover-events/subscriptions/rollback'),
  );
});

test('Pr91125 includes both AKS clusters, both event hubs, Cosmos, and the quarantine subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91125');
  assert.ok(scenario);
  assert.ok(scenario.requiredSourceMarkers.includes('containerservice.'));
  assert.ok(scenario.requiredSourceMarkers.includes('eventhub.'));
  assert.ok(scenario.requiredSourceMarkers.includes('documentdb.'));
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-inference-east-91125'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-inference-west-91125/eventhubs/prompts-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosmosinference91125/sqlDatabases/InferenceDb/containers/PromptLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-quarantine'
      && check.typePath === 'namespaces/sb-inference-ring-91125/topics/inference-events/subscriptions/quarantine'),
  );
});

test('validateTapStack rejects top-level tenantId on Key Vault VaultArgs', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const client = { tenantId: "00000000-0000-0000-0000-000000000000" };',
        '  const rg = { name: "rg-az-warehouse-orchestrator-pulumi-91080" } as any;',
        '  const kv = new azure.keyvault.Vault("kv-warehouse-91080", {',
        '    resourceGroupName: rg.name,',
        '    vaultName: "kv-warehouse-91080",',
        '    location: "eastus",',
        '    tenantId: client.tenantId,',
        '    properties: {',
          '      tenantId: client.tenantId,',
          '      sku: { family: "A", name: "standard" },',
          '      accessPolicies: [],',
        '    },',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /must not set tenantId at the top level of VaultArgs/,
  );
});

test('validateTapStack rejects top-level sku on Key Vault VaultArgs', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const client = { tenantId: "00000000-0000-0000-0000-000000000000" };',
        '  const rg = { name: "rg-az-warehouse-orchestrator-pulumi-91080" } as any;',
        '  const kv = new azure.keyvault.Vault("kv-warehouse-91080", {',
        '    resourceGroupName: rg.name,',
        '    vaultName: "kv-warehouse-91080",',
        '    location: "eastus",',
        '    sku: { family: "A", name: "standard" },',
        '    properties: {',
        '      tenantId: client.tenantId,',
        '      sku: { family: "A", name: "standard" },',
        '      accessPolicies: [],',
        '    },',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /must not set sku at the top level of VaultArgs/,
  );
});

test('validateTapStack rejects Cosmos SQL containers without explicit dependsOn on the SQL database', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const resourceGroup = { name: "rg-az-warehouse-orchestrator-pulumi-91080" } as any;',
        '  const account = { name: "cosmos-warehouse-orchestrator-91080" } as any;',
        '  const sqlDatabase = new azure.documentdb.SqlResourceSqlDatabase("WarehouseStateDb", {',
        '    resourceGroupName: resourceGroup.name,',
        '    accountName: account.name,',
        '    databaseName: "WarehouseStateDb",',
        '    resource: { id: "WarehouseStateDb" },',
        '  });',
        '  const container = new azure.documentdb.SqlResourceSqlContainer("WarehouseState", {',
        '    resourceGroupName: resourceGroup.name,',
        '    accountName: account.name,',
        '    databaseName: "WarehouseStateDb",',
        '    containerName: "WarehouseState",',
        '    resource: { id: "WarehouseState", partitionKey: { paths: ["/pk"], kind: "Hash" } },',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /SqlResourceSqlContainer must include an explicit dependsOn option/,
  );
});

test('validateTapStack rejects private DNS virtual network links without explicit dependsOn on the private zone', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91084');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const resourceGroup = { name: "rg-az-cutover-ring-pulumi-91084" } as any;',
        '  new azure.network.RecordSet("api", {',
        '    resourceGroupName: resourceGroup.name,',
        '    zoneName: "cutover91084.contoso.net",',
        '    relativeRecordSetName: "api",',
        '    recordType: "CNAME",',
        '    ttl: 300,',
        '    cnameRecord: { cname: "cutover.example.net" },',
        '  });',
        '  const privateZone = new azure.network.PrivateZone("cutover91084.internal", {',
        '    resourceGroupName: resourceGroup.name,',
        '    privateZoneName: "cutover91084.internal",',
        '    location: "global",',
        '  });',
        '  const mysqlRecord = new azure.network.PrivateRecordSet("mysql", {',
        '    resourceGroupName: resourceGroup.name,',
        '    privateZoneName: privateZone.name,',
        '    relativeRecordSetName: "mysql",',
        '    recordType: "A",',
        '    ttl: 300,',
        '    aRecords: [{ ipv4Address: "10.42.0.10" }],',
        '  }, { dependsOn: [privateZone] });',
        '  const eastVnet = { id: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet-cutover-east-91084" } as any;',
        '  const link = new azure.network.VirtualNetworkLink("cutover-link-east-91084", {',
        '    resourceGroupName: resourceGroup.name,',
        '    privateZoneName: privateZone.name,',
        '    virtualNetworkLinkName: "cutover-link-east-91084",',
        '    location: "global",',
        '    virtualNetwork: { id: eastVnet.id },',
        '    registrationEnabled: false,',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /azure private DNS virtual network links must include an explicit dependsOn option/,
  );
});

test('validateTapStack rejects private DNS record sets without explicit dependsOn on the private zone', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91084');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const resourceGroup = { name: "rg-az-cutover-ring-pulumi-91084" } as any;',
        '  new azure.network.RecordSet("api", {',
        '    resourceGroupName: resourceGroup.name,',
        '    zoneName: "cutover91084.contoso.net",',
        '    relativeRecordSetName: "api",',
        '    recordType: "CNAME",',
        '    ttl: 300,',
        '    cnameRecord: { cname: "cutover.example.net" },',
        '  });',
        '  const privateZone = new azure.network.PrivateZone("cutover91084.internal", {',
        '    resourceGroupName: resourceGroup.name,',
        '    privateZoneName: "cutover91084.internal",',
        '    location: "global",',
        '  });',
        '  const eastVnet = { id: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/vnet-cutover-east-91084" } as any;',
        '  const link = new azure.network.VirtualNetworkLink("cutover-link-east-91084", {',
        '    resourceGroupName: resourceGroup.name,',
        '    privateZoneName: privateZone.name,',
        '    virtualNetworkLinkName: "cutover-link-east-91084",',
        '    location: "global",',
        '    virtualNetwork: { id: eastVnet.id },',
        '    registrationEnabled: false,',
        '  }, { dependsOn: [privateZone, eastVnet] });',
        '  const record = new azure.network.PrivateRecordSet("mysql", {',
        '    resourceGroupName: resourceGroup.name,',
        '    privateZoneName: privateZone.name,',
        '    relativeRecordSetName: "mysql",',
        '    recordType: "A",',
        '    ttl: 300,',
        '    aRecords: [{ ipv4Address: "10.42.0.10" }],',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /azure private DNS record sets must include an explicit dependsOn option/,
  );
});

test('validateTapStack rejects Key Vault properties blocks that omit properties.sku', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const client = { tenantId: "00000000-0000-0000-0000-000000000000" };',
        '  const rg = { name: "rg-az-warehouse-orchestrator-pulumi-91080" } as any;',
        '  const kv = new azure.keyvault.Vault("kv-warehouse-91080", {',
        '    resourceGroupName: rg.name,',
        '    vaultName: "kv-warehouse-91080",',
        '    location: "eastus",',
        '    properties: {',
        '      tenantId: client.tenantId,',
        '      enableRbacAuthorization: true,',
        '    },',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /must include properties.sku inside the Vault properties block/,
  );
});

test('validateTapStack rejects storage child resources that use raw accountName strings without dependency edges', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const resourceGroup = { name: "rg-az-warehouse-orchestrator-pulumi-91080" } as any;',
        '  const storage = { name: "azwarehouse91080" } as any;',
        '  const raw = new azure.storage.BlobContainer("raw-events", {',
        '    resourceGroupName: resourceGroup.name,',
        '    accountName: "azwarehouse91080",',
        '    containerName: "raw-events",',
        '    publicAccess: "None",',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /azure\.storage child resources must use accountName from the created storage resource output/,
  );
});

test('validateTapStack rejects listStorageAccountKeysOutput calls that use raw accountName strings', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91080');
  assert.ok(scenario);
  const fixedNames = Object.values(scenario.resourceNames).map((value) => `// ${value}`);
  const requiredMarkers = (scenario.requiredSourceMarkers ?? []).map((marker) => `// ${marker}`);
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        ...fixedNames,
        ...requiredMarkers,
        '',
        'export function createTapStack() {',
        '  const resourceGroup = { name: "rg-az-warehouse-orchestrator-pulumi-91080" } as any;',
        '  const storageKeys = azure.storage.listStorageAccountKeysOutput({',
        '    resourceGroupName: resourceGroup.name,',
        '    accountName: "azwarehouse91080",',
        '  });',
        '  return {',
        ...scenario.expectedOutputKeys.map((key) => `    ${key}: "${key}",`),
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /azure\.storage\.listStorageAccountKeysOutput must use accountName from the created storage resource output/,
  );
});

test('Pr91126 includes east and west worker topic subscriptions and private workflow DNS', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91126');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-worker-east'
      && check.typePath === 'namespaces/sb-tenant-recovery-91126/topics/tenant-events/subscriptions/worker-east'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-worker-west'
      && check.typePath === 'namespaces/sb-tenant-recovery-91126/topics/tenant-events/subscriptions/worker-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-workflow'
      && check.typePath === 'privateDnsZones/tenant91126.internal/A/workflow'),
  );
});

test('Pr91127 includes dual IoT hubs, Digital Twins, and Synapse SQL pool checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91127');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-campus-east-91127'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/dt-campus-91127'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syncampus91127/sqlPools/campuspool'),
  );
});

test('Pr91128 includes both DMS projects and the rollback operation policy check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91128');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-grid-91128/projects/mysql-cutover-plan'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-cutover-grid-91128/projects/postgres-cutover-plan'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-rollback-policy'
      && check.typePath === 'service/apim-cutover-grid-91128/apis/cutover-grid-api/operations/rollback-cutover/policies/policy'),
  );
});

test('Pr91129 includes both regional AKS clusters and the billing subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91129');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-inference-east-91129'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-aks'
      && check.typePath === 'managedClusters/aks-inference-west-91129'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-billing'
      && check.typePath === 'namespaces/sb-inference-ring-91129/topics/inference-events/subscriptions/billing'),
  );
});

test('Pr91130 includes dual load balancers, Event Hubs, and the replay subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91130');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-dispatch-east-91130'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'event-hub'
      && check.typePath === 'namespaces/eh-dispatch-91130/eventhubs/dispatch-events'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-dispatch-91130/topics/dispatch-commands/subscriptions/replay'),
  );
});

test('Pr91131 includes east and west worker subscriptions and private workflow DNS', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91131');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-worker-east'
      && check.typePath === 'namespaces/sb-routing-fabric-91131/topics/routing-events/subscriptions/worker-east'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-worker-west'
      && check.typePath === 'namespaces/sb-routing-fabric-91131/topics/routing-events/subscriptions/worker-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'private-dns-workflow'
      && check.typePath === 'privateDnsZones/routing91131.internal/A/workflow'),
  );
});

test('Pr91132 includes dual IoT hubs, Digital Twins, and Synapse SQL pool checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91132');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-thread-east-91132'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/dt-thread-grid-91132'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synthread91132/sqlPools/threadpool'),
  );
});

test('Pr91133 includes all DMS projects and the rollback operation policy check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91133');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-clinical-cutover-91133/projects/mysql-cutover'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres'
      && check.typePath === 'services/dms-clinical-cutover-91133/projects/postgres-cutover'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-replay'
      && check.typePath === 'services/dms-clinical-cutover-91133/projects/replay-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-rollback-policy'
      && check.typePath === 'service/apim-clinical-cutover-91133/apis/clinical-cutover-api/operations/rollback-cutover/policies/policy'),
  );
});

test('Pr91134 includes front door security policy, dual Event Hubs, and Cosmos container checks', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91134');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-compliance-ring-91134/securityPolicies/compliance-ring-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-compliance-west-91134/eventhubs/screening-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/coscompliance91134/sqlDatabases/ComplianceStateDb/containers/ComplianceState'),
  );
});

test('Pr91135 includes both regional AKS clusters, Synapse SQL pool, and the billing subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91135');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-rollout-east-91135'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synrollout91135/sqlPools/rolloutpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-billing'
      && check.typePath === 'namespaces/sb-rollout-ring-91135/topics/rollout-events/subscriptions/billing'),
  );
});
