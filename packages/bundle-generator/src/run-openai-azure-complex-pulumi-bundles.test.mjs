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
    '  const publicZone = new azure.network.Zone("public.example.com", {',
    '    resourceGroupName: "rg-example",',
    '    zoneName: "public.example.com",',
    '    location: "global",',
    '  });',
    '  const privateZone = new azure.network.PrivateZone("private.internal", {',
    '    resourceGroupName: "rg-example",',
    '    privateZoneName: "private.internal",',
    '    location: "global",',
    '  });',
    '  new azure.network.RecordSet("public", {',
    '    resourceGroupName: "rg-example",',
    '    zoneName: publicZone.name,',
    '    relativeRecordSetName: "api",',
    '    recordType: "CNAME",',
    '    ttl: 300,',
    '    cnameRecord: { cname: "origin.example.net" },',
    '  }, { dependsOn: [publicZone] });',
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
    '  const publicZone = new azure.network.Zone("example.contoso.net", {',
    '    resourceGroupName: "rg-example",',
    '    zoneName: "example.contoso.net",',
    '    location: "global",',
    '  });',
    '  new azure.network.RecordSet("public", {',
    '    resourceGroupName: "rg-example",',
    '    zoneName: publicZone.name,',
    '    relativeRecordSetName: "api",',
    '    recordType: "CNAME",',
    '    ttl: 300,',
    '    cnameRecord: { cname: "origin.example.net" },',
    '  }, { dependsOn: [publicZone] });',
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
  const publicZone = new azure.network.Zone("example.contoso.net", {
    resourceGroupName: "rg-example",
    zoneName: "example.contoso.net",
    location: "global",
  });
  new azure.network.RecordSet("east", {
    resourceGroupName: "rg-example",
    zoneName: publicZone.name,
    relativeRecordSetName: "east",
    recordType: "A",
    ttl: 60,
    aRecords: [{ ipv4Address: "10.0.0.4" }],
  }, { dependsOn: [publicZone] });
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

test('validateTapStack rejects public DNS record sets without explicit dependsOn on the public zone', () => {
  const scenario = {
    prompt: 'Use one public DNS zone and one public DNS A record.',
    resourceNames: {
      publicZone: 'yardops91207.contoso.net',
    },
    expectedOutputKeys: ['ExampleOutput'],
    requiredSourceMarkers: ['network.Zone', 'network.RecordSet'],
    forbiddenSourceMarkers: [],
    integrationChecks: [{ typePath: 'dnsZones/yardops91207.contoso.net/A/east-api' }],
  };
  assert.throws(
    () => validateTapStack(
      scenario,
      [
        'import * as azure from "@pulumi/azure-native";',
        'import * as pulumi from "@pulumi/pulumi";',
        '',
        'export function createTapStack() {',
        '  const resourceGroup = { name: "rg-az-yard-robotics-twin-command-lattice-pulumi-91207" } as any;',
        '  const publicZone = new azure.network.Zone("yardops91207.contoso.net", {',
        '    resourceGroupName: resourceGroup.name,',
        '    zoneName: "yardops91207.contoso.net",',
        '    location: "global",',
        '  });',
        '  const apiRecord = new azure.network.RecordSet("east-api", {',
        '    resourceGroupName: resourceGroup.name,',
        '    zoneName: publicZone.name,',
        '    relativeRecordSetName: "east-api",',
        '    recordType: "A",',
        '    ttl: 300,',
        '    aRecords: [{ ipv4Address: "10.20.0.10" }],',
        '  });',
        '  return {',
        '    ExampleOutput: "ok",',
        '  };',
        '}',
        '',
      ].join('\n'),
    ),
    /azure public DNS record sets must include an explicit dependsOn option/,
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

test('Pr91136 includes both regional AKS clusters, Synapse SQL pool, and the release-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91136');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-mlgov-east-91136'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synmlgov91136/sqlPools/governancepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-release-west'
      && check.typePath === 'namespaces/sb-ml-gov-91136/topics/model-governance/subscriptions/release-west'),
  );
});

test('Pr91137 includes dual IoT hubs, Digital Twins, and the safety subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91137');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-industry-east-91137'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-industry-exchange-91137'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-safety'
      && check.typePath === 'namespaces/sb-industry-exchange-91137/topics/industry-incidents/subscriptions/safety'),
  );
});

test('Pr91138 includes all DMS projects and the seal-window policy check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91138');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-nerve-91138/projects/mysql-stage'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-cutover-nerve-91138/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'api-management-seal-policy'
      && check.typePath === 'service/apim-cutover-nerve-91138/apis/cutover-nerve-api/operations/seal-window/policies/policy'),
  );
});

test('Pr91139 includes dual managed environments, dual Event Hubs, and the replay subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91139');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-resilience-east-91139'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-event-hub'
      && check.typePath === 'namespaces/eh-resilience-west-91139/eventhubs/resilience-west'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-resilience-grid-91139/topics/resilience-commands/subscriptions/replay'),
  );
});

test('Pr91140 includes Synapse SQL pool, Cosmos container, and the warehouse subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91140');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synreplay91140/sqlPools/replaypool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosreplay91140/sqlDatabases/ReplayDb/containers/ReplayLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-replay-warehouse-91140/topics/replay-commands/subscriptions/warehouse'),
  );
});

test('Pr91141 includes both regional AKS clusters, PostgreSQL, and the west-drain subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91141');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-inference-east-91141'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-inference-ring-91141/databases/inferencedb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-west-drain'
      && check.typePath === 'namespaces/sb-inference-ring-91141/topics/inference-commands/subscriptions/west-drain'),
  );
});

test('Pr91142 includes dual IoT hubs, Digital Twins, and the replay subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91142');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-yard-east-91142'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-yard-command-91142'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-yard-command-91142/topics/yard-commands/subscriptions/replay'),
  );
});

test('Pr91143 includes all DMS projects and the promote subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91143');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-grid-91143/projects/mysql-stage'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-cutover-grid-91143/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promote'
      && check.typePath === 'namespaces/sb-cutover-grid-91143/topics/cutover-grid-commands/subscriptions/promote'),
  );
});

test('Pr91144 includes front door security policy, dual managed environments, and the green subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91144');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-revision-mesh-91144/securityPolicies/revision-mesh-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-revision-east-91144'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-green'
      && check.typePath === 'namespaces/sb-revision-mesh-91144/topics/revision-commands/subscriptions/green'),
  );
});

test('Pr91145 includes Synapse SQL pool, Cosmos container, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91145');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synreplay91145/sqlPools/replayringpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosreplay91145/sqlDatabases/ReplayRingDb/containers/ReplayRingLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-replay-ring-91145/topics/replay-ring-commands/subscriptions/approve'),
  );
});

test('Pr91146 includes both regional AKS clusters, Cosmos container, and the replay subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91146');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-release-east-91146'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosrelease91146/sqlDatabases/ReleaseVerdictDb/containers/ReleaseVerdicts'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-release-fabric-91146/topics/release-verdicts/subscriptions/replay'),
  );
});

test('Pr91147 includes dual IoT hubs, Synapse SQL pool, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91147');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-twins-east-91147'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syntwins91147/sqlPools/twinops'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-twin-observatory-91147/topics/twin-commands/subscriptions/approve'),
  );
});

test('Pr91148 includes the freeze-audit DMS project, Synapse SQL pool, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91148');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-migration-tribunal-91148/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synmigration91148/sqlPools/migrationpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-migration-tribunal-91148/topics/migration-commands/subscriptions/rollback'),
  );
});

test('Pr91149 includes front door security policy, dual managed environments, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91149');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-container-exchange-91149/securityPolicies/container-exchange-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-exchange-east-91149'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-container-exchange-91149/topics/exchange-commands/subscriptions/approve'),
  );
});

test('Pr91150 includes both regional AKS clusters, Digital Twins, and the warehouse subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91150');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-robotics-east-91150'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-robotics-command-91150'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-robotics-command-91150/topics/robotics-commands/subscriptions/warehouse'),
  );
});

test('Pr91151 includes both relational engines, the replay DMS project, and the treasury subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91151');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-server'
      && check.typePath === 'flexibleServers/mysql-settlement-lattice-91151'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-replay-drill'
      && check.typePath === 'services/dms-settlement-lattice-91151/projects/replay-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-treasury'
      && check.typePath === 'namespaces/sb-settlement-lattice-91151/topics/settlement-batches/subscriptions/treasury'),
  );
});

test('Pr91152 includes Digital Twins, both IoT hubs, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91152');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-twin-arbitration-91152'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-twin-east-91152'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-twin-arbitration-91152/topics/twin-commands/subscriptions/approve'),
  );
});

test('Pr91153 includes both regional AKS clusters, Synapse SQL pool, and the catalog subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91153');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-inference-east-91153'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syninference91153/sqlPools/inferencepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-catalog'
      && check.typePath === 'namespaces/sb-inference-marketplace-91153/topics/rollout-commands/subscriptions/catalog'),
  );
});

test('Pr91154 includes all DMS projects, Synapse SQL pool, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91154');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-migration-exchange-91154/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synmigration91154/sqlPools/exchangepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-migration-exchange-91154/topics/migration-exchange/subscriptions/rollback'),
  );
});

test('Pr91155 includes both regional AKS clusters, Digital Twins, and the dispatch subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91155');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-robotics-east-91155'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-robotics-verdict-91155'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch'
      && check.typePath === 'namespaces/sb-robotics-verdict-91155/topics/robotics-verdicts/subscriptions/dispatch'),
  );
});

test('Pr91156 includes dual application gateways, workflow, and the replay subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91156');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-application-gateway'
      && check.typePath === 'applicationGateways/agw-cargo-east-91156'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/logic-cargo-disruption-91156'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-cargo-disruption-91156/topics/cargo-disruptions/subscriptions/replay'),
  );
});

test('Pr91157 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91157');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-substation-east-91157'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-substation-twin-91157'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synsubstation91157/sqlPools/twinpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-safety'
      && check.typePath === 'namespaces/sb-substation-twin-91157/topics/substation-remediations/subscriptions/safety'),
  );
});

test('Pr91158 includes front door security policy, dual AKS, dual managed environments, and the promotion subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91158');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-biologics-release-91158/securityPolicies/biologics-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-biologics-east-91158'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-biologics-east-91158'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promotion'
      && check.typePath === 'namespaces/sb-biologics-release-91158/topics/release-commands/subscriptions/promotion'),
  );
});

test('Pr91159 includes all DMS projects, Synapse SQL pool, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91159');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-cutover-triage-91159/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syncutover91159/sqlPools/triagepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-cutover-triage-91159/topics/cutover-commands/subscriptions/rollback'),
  );
});

test('Pr91160 includes front door security policy, dual IoT hubs, Digital Twins, Synapse SQL pool, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91160');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-robotics-safety-91160/securityPolicies/robotics-safety-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-robotics-east-91160'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-robotics-safety-91160'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synrobotics91160/sqlPools/safetypool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-robotics-safety-91160/topics/robotics-overrides/subscriptions/approve'),
  );
});

test('Pr91161 includes front door security policy, dual AKS clusters, Synapse SQL pool, and the promote-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91161');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-genomics-release-91161/securityPolicies/genomics-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-genomics-east-91161'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syngenomics91161/sqlPools/releasepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promote-west'
      && check.typePath === 'namespaces/sb-genomics-release-91161/topics/genomics-release-events/subscriptions/promote-west'),
  );
});

test('Pr91162 includes dual load balancers, MySQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91162');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-branch-east-91162'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-branch-exchange-91162/databases/branchexchange'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-branch-exchange-91162/topics/branch-exchange-events/subscriptions/compliance'),
  );
});

test('Pr91163 includes all DMS projects, both relational ledgers, and the treasury subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91163');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-rollback-drill'
      && check.typePath === 'services/dms-payments-cutover-91163/projects/rollback-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-payments-cutover-91163/databases/paymentsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-payments-cutover-91163/databases/settlementdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-treasury'
      && check.typePath === 'namespaces/sb-payments-cutover-91163/topics/payments-cutover-events/subscriptions/treasury'),
  );
});

test('Pr91164 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the analytics subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91164');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-outage-east-91164'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-outage-twin-91164'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synoutage91164/sqlPools/outagepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-outage-twin-91164/topics/outage-commands/subscriptions/analytics'),
  );
});

test('Pr91165 includes dual application gateways, managed identity, PostgreSQL database, and the dispatch-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91165');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-application-gateway'
      && check.typePath === 'applicationGateways/agw-warehouse-east-91165'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'managed-identity'
      && check.typePath === 'userAssignedIdentities/id-warehouse-lattice-91165'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-warehouse-lattice-91165/databases/warehousedb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch-west'
      && check.typePath === 'namespaces/sb-warehouse-lattice-91165/topics/warehouse-verdicts/subscriptions/dispatch-west'),
  );
});

test('Pr91211 includes front door security policy, dual AKS clusters, Synapse SQL pool, and the promote-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91211');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-genomics-release-91211/securityPolicies/genomics-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-genomics-east-91211'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syngenomics91211/sqlPools/releasepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promote-west'
      && check.typePath === 'namespaces/sb-genomics-release-91211/topics/genomics-release-events/subscriptions/promote-west'),
  );
});

test('Pr91212 includes dual load balancers, MySQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91212');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-branch-east-91212'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-branch-exchange-91212/databases/branchexchange'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-branch-exchange-91212/topics/branch-exchange-events/subscriptions/compliance'),
  );
});

test('Pr91213 includes all DMS projects, both relational ledgers, and the treasury subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91213');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-rollback-drill'
      && check.typePath === 'services/dms-payments-cutover-91213/projects/rollback-drill'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-payments-cutover-91213/databases/paymentsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-payments-cutover-91213/databases/settlementdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-treasury'
      && check.typePath === 'namespaces/sb-payments-cutover-91213/topics/payments-cutover-events/subscriptions/treasury'),
  );
});

test('Pr91214 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the analytics subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91214');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-outage-east-91214'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-outage-twin-91214'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synoutage91214/sqlPools/outagepool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-outage-twin-91214/topics/outage-commands/subscriptions/analytics'),
  );
});

test('Pr91215 includes dual application gateways, managed identity, PostgreSQL database, and the dispatch-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91215');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-application-gateway'
      && check.typePath === 'applicationGateways/agw-warehouse-east-91215'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'managed-identity'
      && check.typePath === 'userAssignedIdentities/id-warehouse-lattice-91215'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-warehouse-lattice-91215/databases/warehousedb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch-west'
      && check.typePath === 'namespaces/sb-warehouse-lattice-91215/topics/warehouse-verdicts/subscriptions/dispatch-west'),
  );
});

test('Pr91166 includes dual load balancers, MySQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91166');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-branch-east-91166'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-branch-liquidity-91166/databases/branchsettlement'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-branch-liquidity-91166/topics/branch-settlement-events/subscriptions/compliance'),
  );
});

test('Pr91167 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the safety subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91167');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-refinery-east-91167'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-refinery-twin-91167'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synrefinery91167/sqlPools/refinerypool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-safety'
      && check.typePath === 'namespaces/sb-refinery-twin-91167/topics/refinery-twin-events/subscriptions/safety'),
  );
});

test('Pr91168 includes all DMS projects, both relational ledgers, and the treasury subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91168');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-merchant-cutover-91168/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-merchant-cutover-91168/databases/merchantdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-merchant-cutover-91168/databases/ledgerdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-treasury'
      && check.typePath === 'namespaces/sb-merchant-cutover-91168/topics/merchant-cutover-events/subscriptions/treasury'),
  );
});

test('Pr91169 includes front door security policy, dual AKS clusters, Synapse SQL pool, and the promotion subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91169');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-clinical-imaging-91169/securityPolicies/clinical-imaging-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-imaging-east-91169'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synimaging91169/sqlPools/reviewpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promotion'
      && check.typePath === 'namespaces/sb-clinical-imaging-91169/topics/clinical-imaging-events/subscriptions/promotion'),
  );
});

test('Pr91170 includes dual load balancers, dual managed environments, MySQL database, and the dispatch-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91170');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-carriers-east-91170'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-carriers-east-91170'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-carriers-91170/databases/carrierreturns'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch-west'
      && check.typePath === 'namespaces/sb-carrier-returns-91170/topics/carrier-return-events/subscriptions/dispatch-west'),
  );
});

test('Pr91171 includes front door security policy, dual AKS clusters, PostgreSQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91171');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-fare-clearing-91171/securityPolicies/fare-clearing-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-fare-east-91171'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-fare-clearing-91171/databases/faresettlement'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-fare-clearing-91171/topics/fare-clearing-events/subscriptions/compliance'),
  );
});

test('Pr91172 includes dual IoT hubs, Digital Twins, Cosmos container, and the safety subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91172');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-offshore-east-91172'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-offshore-twin-91172'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosoffshore91172/sqlDatabases/OffshoreTwinDb/containers/OffshoreLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-safety'
      && check.typePath === 'namespaces/sb-offshore-twin-91172/topics/offshore-twin-events/subscriptions/safety'),
  );
});

test('Pr91173 includes front door security policy, all DMS projects, both relational ledgers, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91173');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-securities-cutover-91173/securityPolicies/securities-cutover-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-securities-cutover-91173/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-securities-91173/databases/securitiesdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-securities-91173/databases/ledgerdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-securities-cutover-91173/topics/securities-cutover-events/subscriptions/rollback'),
  );
});

test('Pr91174 includes dual load balancers, dual managed environments, PostgreSQL database, and the dispatch-west subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91174');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-supply-east-91174'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-supply-east-91174'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-supply-returns-91174/databases/supplyreturns'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch-west'
      && check.typePath === 'namespaces/sb-supply-returns-91174/topics/supply-return-events/subscriptions/dispatch-west'),
  );
});

test('Pr91175 includes front door security policy, dual managed environments, PostgreSQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91175');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-appeals-edge-91175/securityPolicies/appeals-edge-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-appeals-east-91175'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-appeals-edge-91175/databases/appealsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-appeals-edge-91175/topics/appeals-events/subscriptions/compliance'),
  );
});

test('Pr91176 includes front door security policy, workflow, PostgreSQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91176');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-benefits-mesh-91176/securityPolicies/benefits-mesh-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/logic-benefits-mesh-91176'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-benefits-mesh-91176/databases/benefitsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-benefits-mesh-91176/topics/benefits-events/subscriptions/compliance'),
  );
});

test('Pr91177 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the analytics subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91177');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-refinery-east-91177'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-refinery-rail-91177'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-refinery-rail-91177/sqlPools/refinerysqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-refinery-rail-91177/topics/refinery-events/subscriptions/analytics'),
  );
});

test('Pr91178 includes front door security policy, all DMS projects, both relational ledgers, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91178');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-treasury-cutover-91178/securityPolicies/treasury-cutover-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-reporting'
      && check.typePath === 'services/dms-treasury-cutover-91178/projects/reporting-ledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-treasury-91178/databases/treasurydb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-treasury-91178/databases/paymentsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-treasury-cutover-91178/topics/cutover-events/subscriptions/rollback'),
  );
});

test('Pr91179 includes dual load balancers, dual managed environments, PostgreSQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91179');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-coldchain-east-91179'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-coldchain-west-91179'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-coldchain-swarm-91179/databases/dispatchdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-coldchain-swarm-91179/topics/coldchain-events/subscriptions/compliance'),
  );
});

test('Pr91180 includes front door security policy, dual AKS clusters, Synapse SQL pool, and the warehouse subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91180');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-release-citadel-91180/securityPolicies/release-citadel-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-release-east-91180'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-release-citadel-91180/sqlPools/releasesqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-release-citadel-91180/topics/release-events/subscriptions/warehouse'),
  );
});

test('Pr91181 includes front door security policy, workflow, MySQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91181');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-pharmacy-edge-91181/securityPolicies/pharmacy-edge-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/logic-pharmacy-edge-91181'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-pharmacy-edge-91181/databases/pharmacyledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-pharmacy-edge-91181/topics/pharmacy-events/subscriptions/compliance'),
  );
});

test('Pr91182 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the analytics subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91182');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-refinery-east-91182'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-refinery-foundry-91182'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-refinery-foundry-91182/sqlPools/refinerysqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-refinery-foundry-91182/topics/refinery-commands/subscriptions/analytics'),
  );
});

test('Pr91183 includes front door security policy, all DMS projects, both relational ledgers, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91183');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-tax-cutover-91183/securityPolicies/tax-cutover-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-reporting-b'
      && check.typePath === 'services/dms-tax-cutover-91183/projects/reporting-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-tax-cutover-91183/databases/taxledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-tax-cutover-91183/databases/reportingdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-tax-cutover-91183/topics/tax-cutover-events/subscriptions/rollback'),
  );
});

test('Pr91184 includes dual load balancers, dual managed environments, PostgreSQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91184');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-airside-east-91184'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-airside-west-91184'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-airside-dispatch-91184/databases/turnarounddb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-airside-dispatch-91184/topics/airside-events/subscriptions/compliance'),
  );
});

test('Pr91185 includes front door security policy, dual AKS clusters, Synapse SQL pool, and the promotion subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91185');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-commerce-release-91185/securityPolicies/commerce-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-commerce-east-91185'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-commerce-release-91185/sqlPools/releasesqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promotion'
      && check.typePath === 'namespaces/sb-commerce-release-91185/topics/release-events/subscriptions/promotion'),
  );
});

test('Pr91186 includes front door security policy, workflow, MySQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91186');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-payments-perimeter-91186/securityPolicies/payments-perimeter-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'logic-workflow'
      && check.typePath === 'workflows/logic-payments-perimeter-91186'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-payments-perimeter-91186/databases/paymentsledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-payments-perimeter-91186/topics/payments-events/subscriptions/compliance'),
  );
});

test('Pr91187 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the dispatch subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91187');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-haulage-east-91187'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-haulage-twin-91187'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-haulage-twin-91187/sqlPools/haulagesqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch'
      && check.typePath === 'namespaces/sb-haulage-twin-91187/topics/haulage-commands/subscriptions/dispatch'),
  );
});

test('Pr91188 includes front door security policy, the brokerage migration project, both relational ledgers, and the rollback subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91188');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-customs-cutover-91188/securityPolicies/customs-cutover-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-brokerage-b'
      && check.typePath === 'services/dms-customs-cutover-91188/projects/brokerage-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'mysql-database'
      && check.typePath === 'flexibleServers/mysql-customs-cutover-91188/databases/tariffledger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-customs-cutover-91188/databases/reportingdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-customs-cutover-91188/topics/customs-cutover-events/subscriptions/rollback'),
  );
});

test('Pr91189 includes dual load balancers, dual managed environments, PostgreSQL database, and the compliance subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91189');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-load-balancer'
      && check.typePath === 'loadBalancers/lb-seaport-east-91189'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'west-managed-environment'
      && check.typePath === 'managedEnvironments/cae-seaport-west-91189'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-seaport-dispatch-91189/databases/dispatchdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-compliance'
      && check.typePath === 'namespaces/sb-seaport-dispatch-91189/topics/seaport-events/subscriptions/compliance'),
  );
});

test('Pr91190 includes front door security policy, dual AKS clusters, Synapse SQL pool, and the promotion subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91190');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-merch-release-91190/securityPolicies/merch-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-merch-east-91190'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-merch-release-91190/sqlPools/merchsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promotion'
      && check.typePath === 'namespaces/sb-merch-release-91190/topics/merch-events/subscriptions/promotion'),
  );
});

test('Pr91191 includes Front Door security policy, both Event Hubs namespaces, PostgreSQL database, and tower subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91191');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-aviation-slot-91191/securityPolicies/aviation-slot-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-event-hub-namespace'
      && check.typePath === 'namespaces/eh-aviation-east-91191'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-aviation-slot-91191/databases/slotcontrol'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-tower'
      && check.typePath === 'namespaces/sb-aviation-slot-91191/topics/slot-events/subscriptions/tower'),
  );
});

test('Pr91192 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and the dispatch subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91192');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-factory-east-91192'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-factory-twin-91192'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-factory-91192/sqlPools/factorysqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-dispatch'
      && check.typePath === 'namespaces/sb-factory-91192/topics/factory-alerts/subscriptions/dispatch'),
  );
});

test('Pr91193 includes Front Door security policy, DMS projects, Synapse SQL pool, and rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91193');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-customs-observatory-91193/securityPolicies/customs-observatory-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres-source-b'
      && check.typePath === 'services/dms-customs-observatory-91193/projects/postgres-source-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-customs-observatory-91193/sqlPools/customssqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-customs-observatory-91193/topics/customs-cutover/subscriptions/rollback'),
  );
});

test('Pr91194 includes public IPs, dual AKS clusters, Cosmos container, and billing subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91194');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-public-ip'
      && check.typePath === 'publicIPAddresses/pip-seaport-east-91194'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-seaport-east-91194'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosseaport91194/sqlDatabases/YardStateDb/containers/YardState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-billing'
      && check.typePath === 'namespaces/sb-seaport-yard-91194/topics/yard-commands/subscriptions/billing'),
  );
});

test('Pr91195 includes Front Door security policy, dual managed environments, PostgreSQL database, and replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91195');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-fulfillment-mesh-91195/securityPolicies/fulfillment-mesh-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-fulfillment-east-91195'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-fulfillment-mesh-91195/databases/fulfillmentdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-fulfillment-mesh-91195/topics/fulfillment-events/subscriptions/replay'),
  );
});

test('Pr91196 includes Front Door security policy, dual AKS clusters, PostgreSQL database, and warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91196');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-pharma-release-91196/securityPolicies/pharma-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-pharma-east-91196'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-pharma-release-91196/databases/releaselog'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-pharma-release-91196/topics/release-events/subscriptions/warehouse'),
  );
});

test('Pr91197 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and analytics subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91197');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-refinery-east-91197'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-refinery-91197'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-refinery-91197/sqlPools/shutdownsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-refinery-91197/topics/refinery-events/subscriptions/analytics'),
  );
});

test('Pr91198 includes Front Door security policy, DMS projects, Synapse SQL pool, and rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91198');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-tribunal-migration-91198/securityPolicies/tribunal-migration-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres-archive-b'
      && check.typePath === 'services/dms-tribunal-91198/projects/postgres-archive-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-tribunal-91198/sqlPools/tribunalsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-tribunal-91198/topics/tribunal-events/subscriptions/rollback'),
  );
});

test('Pr91199 includes public IPs, dual AKS clusters, Cosmos container, and billing subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91199');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-public-ip'
      && check.typePath === 'publicIPAddresses/pip-telecom-east-91199'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-telecom-east-91199'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/costelecom91199/sqlDatabases/RolloutStateDb/containers/RolloutState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-billing'
      && check.typePath === 'namespaces/sb-telecom-91199/topics/rollout-events/subscriptions/billing'),
  );
});

test('Pr91200 includes Front Door security policy, dual managed environments, PostgreSQL database, and replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91200');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-returns-nerve-91200/securityPolicies/returns-nerve-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-returns-east-91200'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-returns-nerve-91200/databases/returnsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-returns-91200/topics/returns-events/subscriptions/replay'),
  );
});

test('Pr91201 includes Front Door security policy, dual AKS clusters, PostgreSQL database, and warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91201');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-aviation-release-91201/securityPolicies/aviation-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-aviation-east-91201'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-aviation-release-91201/databases/releaselog'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-aviation-release-91201/topics/release-events/subscriptions/warehouse'),
  );
});

test('Pr91202 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and analytics subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91202');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-rail-east-91202'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-rail-91202'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-rail-91202/sqlPools/shutdownsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-rail-91202/topics/rail-events/subscriptions/analytics'),
  );
});

test('Pr91203 includes Front Door security policy, DMS projects, Synapse SQL pool, and rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91203');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-banking-ledger-migration-91203/securityPolicies/banking-ledger-migration-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres-archive-b'
      && check.typePath === 'services/dms-banking-91203/projects/postgres-archive-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-banking-91203/sqlPools/bankingsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-banking-91203/topics/banking-events/subscriptions/rollback'),
  );
});

test('Pr91204 includes public IPs, dual AKS clusters, Cosmos container, and billing subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91204');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-public-ip'
      && check.typePath === 'publicIPAddresses/pip-utility-east-91204'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-utility-east-91204'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosutility91204/sqlDatabases/RolloutStateDb/containers/RolloutState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-billing'
      && check.typePath === 'namespaces/sb-utility-91204/topics/rollout-events/subscriptions/billing'),
  );
});

test('Pr91205 includes Front Door security policy, dual managed environments, PostgreSQL database, and replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91205');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-claims-nerve-91205/securityPolicies/claims-nerve-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-claims-east-91205'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-claims-nerve-91205/databases/claimsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-claims-91205/topics/claims-events/subscriptions/replay'),
  );
});

test('Pr91206 includes both regional AKS clusters, PostgreSQL, and the west-drain subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91206');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-inference-east-91206'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-inference-ring-91206/databases/inferencedb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-west-drain'
      && check.typePath === 'namespaces/sb-inference-ring-91206/topics/inference-commands/subscriptions/west-drain'),
  );
});

test('Pr91207 includes dual IoT hubs, Digital Twins, and the replay subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91207');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-yard-east-91207'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-yard-command-91207'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-yard-command-91207/topics/yard-commands/subscriptions/replay'),
  );
});

test('Pr91208 includes all DMS projects and the promote subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91208');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-mysql'
      && check.typePath === 'services/dms-cutover-grid-91208/projects/mysql-stage'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-freeze-audit'
      && check.typePath === 'services/dms-cutover-grid-91208/projects/freeze-audit'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-promote'
      && check.typePath === 'namespaces/sb-cutover-grid-91208/topics/cutover-grid-commands/subscriptions/promote'),
  );
});

test('Pr91209 includes front door security policy, dual managed environments, and the green subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91209');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-revision-mesh-91209/securityPolicies/revision-mesh-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-revision-east-91209'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-green'
      && check.typePath === 'namespaces/sb-revision-mesh-91209/topics/revision-commands/subscriptions/green'),
  );
});

test('Pr91210 includes Synapse SQL pool, Cosmos container, and the approve subscription check', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91210');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/synreplay91210/sqlPools/replayringpool'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/cosreplay91210/sqlDatabases/ReplayRingDb/containers/ReplayRingLedger'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-approve'
      && check.typePath === 'namespaces/sb-replay-ring-91210/topics/replay-ring-commands/subscriptions/approve'),
  );
});

test('Pr91216 includes Front Door security policy, dual AKS clusters, PostgreSQL database, and warehouse subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91216');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-pharma-release-91216/securityPolicies/pharma-release-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-pharma-east-91216'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-pharma-release-91216/databases/releaselog'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-warehouse'
      && check.typePath === 'namespaces/sb-pharma-release-91216/topics/release-events/subscriptions/warehouse'),
  );
});

test('Pr91217 includes dual IoT hubs, Digital Twins, Synapse SQL pool, and analytics subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91217');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-iot-hub'
      && check.typePath === 'IotHubs/iot-refinery-east-91217'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'digital-twins-instance'
      && check.typePath === 'digitalTwinsInstances/adt-refinery-91217'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-refinery-91217/sqlPools/shutdownsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-analytics'
      && check.typePath === 'namespaces/sb-refinery-91217/topics/refinery-events/subscriptions/analytics'),
  );
});

test('Pr91218 includes Front Door security policy, DMS projects, Synapse SQL pool, and rollback subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91218');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-tribunal-migration-91218/securityPolicies/tribunal-migration-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'dms-project-postgres-archive-b'
      && check.typePath === 'services/dms-tribunal-91218/projects/postgres-archive-b'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'synapse-sql-pool'
      && check.typePath === 'workspaces/syn-tribunal-91218/sqlPools/tribunalsqldw'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-rollback'
      && check.typePath === 'namespaces/sb-tribunal-91218/topics/tribunal-events/subscriptions/rollback'),
  );
});

test('Pr91219 includes public IPs, dual AKS clusters, Cosmos container, and billing subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91219');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-public-ip'
      && check.typePath === 'publicIPAddresses/pip-telecom-east-91219'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-aks'
      && check.typePath === 'managedClusters/aks-telecom-east-91219'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'cosmos-container'
      && check.typePath === 'databaseAccounts/costelecom91219/sqlDatabases/RolloutStateDb/containers/RolloutState'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-billing'
      && check.typePath === 'namespaces/sb-telecom-91219/topics/rollout-events/subscriptions/billing'),
  );
});

test('Pr91220 includes Front Door security policy, dual managed environments, PostgreSQL database, and replay subscription', () => {
  const scenario = scenarios.find((item) => item.prId === 'Pr91220');
  assert.ok(scenario);
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'front-door-security-policy'
      && check.typePath === 'profiles/afd-returns-nerve-91220/securityPolicies/returns-nerve-security-policy'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'east-managed-environment'
      && check.typePath === 'managedEnvironments/cae-returns-east-91220'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'postgres-database'
      && check.typePath === 'flexibleServers/pg-returns-nerve-91220/databases/returnsdb'),
  );
  assert.ok(
    scenario.integrationChecks.some((check) => check.label === 'service-bus-subscription-replay'
      && check.typePath === 'namespaces/sb-returns-91220/topics/returns-events/subscriptions/replay'),
  );
});
