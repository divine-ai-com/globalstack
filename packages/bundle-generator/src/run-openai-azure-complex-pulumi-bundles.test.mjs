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
