import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEdgeRouterServer } from '../../packages/azure-data-plane/src/edge-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-waf-policy-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, options.timeoutMs ?? 900000);
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, error: error.message });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1 });
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function withRuntimeServers(fn) {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const armServer = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
  });
  const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
  await new Promise(resolve => armServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
  const armPort = armServer.address().port;
  const edgePort = edgeServer.address().port;
  try {
    return await fn({ armPort, edgePort, runtime });
  } finally {
    await new Promise(resolve => edgeServer.close(resolve));
    await new Promise(resolve => armServer.close(resolve));
  }
}

async function httpJson(port, method, path, body, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.auth === false ? {} : { authorization: authHeader }),
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? result.body?.Code ?? null;
}

async function edgeJson(port, method, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.host ? { 'x-forwarded-host': options.host } : {}),
      ...(options.protocol ? { 'x-forwarded-proto': options.protocol } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function appWafPath(resourceGroup, policyName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `ApplicationGatewayWebApplicationFirewallPolicies/${policyName}`, apiVersion);
}

function frontDoorWafPath(resourceGroup, policyName, apiVersion = '2024-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `FrontDoorWebApplicationFirewallPolicies/${policyName}`, apiVersion);
}

function cdnProfilePath(resourceGroup, profileName, apiVersion = '2023-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}`, apiVersion);
}

function afdEndpointPath(resourceGroup, profileName, endpointName, apiVersion = '2023-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/afdEndpoints/${endpointName}`, apiVersion);
}

function cdnSecurityPolicyPath(resourceGroup, profileName, policyName, apiVersion = '2024-02-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/securityPolicies/${policyName}`, apiVersion);
}

function virtualNetworkPath(resourceGroup, vnetName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}`, apiVersion);
}

function applicationGatewayPath(resourceGroup, gatewayName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `applicationGateways/${gatewayName}`, apiVersion);
}

function publicIpPath(resourceGroup, publicIpName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `publicIPAddresses/${publicIpName}`, apiVersion);
}

function appWafBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'robotics-edge-waf' },
    properties: {
      policySettings: {
        state: 'Enabled',
        mode: 'Prevention',
        requestBodyCheck: true,
        maxRequestBodySizeInKb: 128,
      },
      managedRules: {
        managedRuleSets: [
          { ruleSetType: 'OWASP', ruleSetVersion: '3.2' },
        ],
      },
      customRules: [
        {
          name: 'BlockBadBotHeader',
          priority: 100,
          ruleType: 'MatchRule',
          action: 'Block',
          matchConditions: [
            {
              matchVariables: [{ variableName: 'RequestHeaders', selector: 'User-Agent' }],
              operator: 'Contains',
              negationConditon: false,
              matchValues: ['bad-bot'],
            },
          ],
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function frontDoorWafBody(overrides = {}) {
  return {
    location: 'global',
    sku: { name: 'Premium_AzureFrontDoor' },
    tags: { workload: 'robotics-frontdoor-waf' },
    properties: {
      policySettings: {
        enabledState: 'Enabled',
        mode: 'Prevention',
        requestBodyCheck: 'Enabled',
        customBlockResponseStatusCode: 403,
      },
      managedRules: {
        managedRuleSets: [
          { ruleSetType: 'DefaultRuleSet', ruleSetVersion: '1.0' },
        ],
      },
      customRules: {
        rules: [
          {
            name: 'BlockBadBotHeader',
            priority: 100,
            ruleType: 'MatchRule',
            action: 'Block',
            enabledState: 'Enabled',
            matchConditions: [
              {
                matchVariable: 'RequestHeaders',
                selector: 'User-Agent',
                operator: 'Contains',
                negateCondition: false,
                matchValue: ['bad-bot'],
                transforms: ['Lowercase'],
              },
            ],
          },
        ],
      },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function cdnProfileBody() {
  return {
    location: 'eastus',
    sku: { name: 'Standard_AzureFrontDoor' },
    properties: {},
  };
}

function vnetBody() {
  return {
    location: 'eastus',
    properties: {
      addressSpace: { addressPrefixes: ['10.92.0.0/16'] },
      subnets: [
        { name: 'appgw', properties: { addressPrefix: '10.92.1.0/24' } },
        { name: 'backend', properties: { addressPrefix: '10.92.2.0/24' } },
      ],
    },
  };
}

function publicIpBody(domainNameLabel) {
  return {
    location: 'eastus',
    sku: { name: 'Standard' },
    properties: {
      publicIPAllocationMethod: 'Static',
      publicIPAddressVersion: 'IPv4',
      dnsSettings: { domainNameLabel },
    },
  };
}

function applicationGatewayBody({ resourceGroup, gatewayName, subnetId, firewallPolicyId }) {
  const gatewayId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`;
  const publicIpId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/pip-${gatewayName}`;
  return {
    location: 'eastus',
    sku: { name: 'WAF_v2', tier: 'WAF_v2', capacity: 1 },
    properties: {
      firewallPolicy: firewallPolicyId ? { id: firewallPolicyId } : undefined,
      gatewayIPConfigurations: [
        {
          name: 'appGatewayIpConfig',
          properties: { subnet: { id: subnetId } },
        },
      ],
      frontendIPConfigurations: [
        {
          name: 'frontend',
          properties: { publicIPAddress: { id: publicIpId } },
        },
      ],
      frontendPorts: [
        { name: 'http', properties: { port: 80 } },
      ],
      backendAddressPools: [
        { name: 'backend', properties: { backendAddresses: [{ fqdn: 'robotics.backend.local' }] } },
      ],
      backendHttpSettingsCollection: [
        { name: 'httpSettings', properties: { port: 80, protocol: 'Http', cookieBasedAffinity: 'Disabled' } },
      ],
      httpListeners: [
        {
          name: 'listener',
          properties: {
            frontendIPConfiguration: { id: `${gatewayId}/frontendIPConfigurations/frontend` },
            frontendPort: { id: `${gatewayId}/frontendPorts/http` },
            protocol: 'Http',
          },
        },
      ],
      requestRoutingRules: [
        {
          name: 'rule',
          properties: {
            ruleType: 'Basic',
            priority: 100,
            httpListener: { id: `${gatewayId}/httpListeners/listener` },
            backendAddressPool: { id: `${gatewayId}/backendAddressPools/backend` },
            backendHttpSettings: { id: `${gatewayId}/backendHttpSettingsCollection/httpSettings` },
          },
        },
      ],
    },
  };
}

function cdnSecurityPolicyBody({ wafPolicyId, endpointId, overrides = {} }) {
  return {
    properties: {
      parameters: {
        type: 'WebApplicationFirewall',
        wafPolicy: { id: wafPolicyId },
        associations: [
          {
            domains: [{ id: endpointId }],
            patternsToMatch: ['/*'],
          },
        ],
      },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody({ resourceGroup, frontDoorWafName, profileName, securityPolicyName }) {
  const wafPolicyId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/${frontDoorWafName}`;
  const endpointId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Cdn/profiles/${profileName}/afdEndpoints/default`;
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies',
            apiVersion: '2024-05-01',
            name: frontDoorWafName,
            location: 'global',
            sku: frontDoorWafBody().sku,
            properties: frontDoorWafBody().properties,
          },
          {
            type: 'Microsoft.Cdn/profiles',
            apiVersion: '2023-05-01',
            name: profileName,
            location: 'eastus',
            sku: cdnProfileBody().sku,
            properties: {},
          },
          {
            type: 'Microsoft.Cdn/profiles/securityPolicies',
            apiVersion: '2024-02-01',
            name: `${profileName}/${securityPolicyName}`,
            dependsOn: [
              `Microsoft.Cdn/profiles/${profileName}`,
              `Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/${frontDoorWafName}`,
            ],
            properties: cdnSecurityPolicyBody({ wafPolicyId, endpointId }).properties,
          },
        ],
        outputs: {
          frontDoorWafName: { type: 'string', value: frontDoorWafName },
          securityPolicyName: { type: 'string', value: securityPolicyName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-waf-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-waf-missing-${suffix}`;
  const appWafName = `waf-${suffix}`.slice(0, 40);
  const frontDoorWafName = `fdwaf-${suffix}`.slice(0, 40);
  const profileName = `cdn-waf-${suffix}`.slice(0, 40);
  const afdEndpointName = `afd-${suffix}`.slice(0, 40);
  const securityPolicyName = `security-${suffix}`.slice(0, 40);
  const missingPolicyName = `security-missing-${suffix}`.slice(0, 40);
  const vnetName = `vnet-${suffix}`.slice(0, 40);
  const appGatewayName = `agw-${suffix}`.slice(0, 40);
  const gatewayPublicIpName = `pip-${appGatewayName}`;
  const gatewayDomainLabel = `waf${suffix}`.slice(0, 30);
  const appWafPolicyId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/${appWafName}`;
  const frontDoorWafPolicyId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/${frontDoorWafName}`;
  const endpointId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Cdn/profiles/${profileName}/afdEndpoints/${afdEndpointName}`;
  const gatewaySubnetId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/appgw`;

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({ name, ok: true, durationMs: Date.now() - startedAt, ...detail });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error?.stack ?? String(error) });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  await withRuntimeServers(async ({ armPort, edgePort, runtime }) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('malformed bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Token bad' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('wrong bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Bearer wrong-token' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription mismatch is rejected', async () => {
      const path = `/subscriptions/99999999-9999-9999-9999-999999999999/resourceGroups/${resourceGroup}?api-version=2021-04-01`;
      const result = await httpJson(armPort, 'GET', path);
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Network', `ApplicationGatewayWebApplicationFirewallPolicies/${appWafName}`), appWafBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('waf policy create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', appWafPath(missingResourceGroup, appWafName), appWafBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cdn security policy create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', cdnSecurityPolicyPath(missingResourceGroup, profileName, securityPolicyName), cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId }));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-waf-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('waf policy collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'ApplicationGatewayWebApplicationFirewallPolicies', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('waf policy delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', appWafPath(resourceGroup, `waf-missing-${suffix}`.slice(0, 40)));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('cdn security policy create requires an existing profile', async () => {
      const result = await httpJson(armPort, 'PUT', cdnSecurityPolicyPath(resourceGroup, profileName, securityPolicyName), cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId }));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['waf policy empty body is rejected', appWafName, {}, 'LocationRequired'],
      ['waf policy invalid location is rejected', appWafName, appWafBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['waf policy invalid name is rejected', `-bad-${suffix}`, appWafBody(), 'InvalidResourceName'],
      ['waf policy missing settings is rejected', appWafName, appWafBody({ properties: { policySettings: undefined } }), 'InvalidRequestFormat'],
      ['waf policy invalid state is rejected', appWafName, appWafBody({ properties: { policySettings: { state: 'Paused', mode: 'Prevention' } } }), 'InvalidRequestFormat'],
      ['waf policy invalid mode is rejected', appWafName, appWafBody({ properties: { policySettings: { state: 'Enabled', mode: 'Audit' } } }), 'InvalidRequestFormat'],
      ['waf policy missing managed rules is rejected', appWafName, appWafBody({ properties: { managedRules: { managedRuleSets: [] } } }), 'InvalidRequestFormat'],
      ['waf policy invalid custom rule priority is rejected', appWafName, appWafBody({ properties: { customRules: [{ name: 'bad', priority: 0, ruleType: 'MatchRule', action: 'Block', matchConditions: [{}] }] } }), 'InvalidRequestFormat'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', appWafPath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('waf policy create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', appWafPath(resourceGroup, appWafName), appWafBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.resourceState, 'Enabled');
      return { status: result.status };
    });

    await record('front door waf policy create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', frontDoorWafPath(resourceGroup, frontDoorWafName), frontDoorWafBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.resourceState, 'Enabled');
      return { status: result.status };
    });

    await record('local waf evaluator allows clean request', async () => {
      const result = runtime.wafEvaluator.evaluate({
        policyName: appWafName,
        request: { method: 'GET', uri: '/robotics/telemetry', headers: { 'User-Agent': 'trusted-robot-client' } },
      });
      assert.equal(result.action, 'Allow');
      assert.equal(result.reason, 'NoRuleMatch');
      assert.deepEqual(result.matchedRules, []);
      return { action: result.action, reason: result.reason };
    });

    await record('local front door waf evaluator blocks bad bot in prevention mode', async () => {
      const result = runtime.wafEvaluator.evaluate({
        policyRef: frontDoorWafPolicyId,
        request: { method: 'GET', uri: '/robotics/telemetry', headers: { 'User-Agent': 'bad-bot/1.0' } },
      });
      assert.equal(result.action, 'Block');
      assert.equal(result.reason, 'CustomRuleMatch');
      assert.equal(result.policyName, frontDoorWafName);
      return { action: result.action, reason: result.reason, policyName: result.policyName };
    });

    await record('local waf evaluator blocks bad bot in prevention mode', async () => {
      const result = runtime.wafEvaluator.evaluate({
        policyName: appWafName,
        request: { method: 'GET', uri: '/mlops/model-registry', headers: { 'User-Agent': 'bad-bot/1.0' } },
      });
      assert.equal(result.action, 'Block');
      assert.equal(result.reason, 'CustomRuleMatch');
      assert.equal(result.matchedRules[0].name, 'BlockBadBotHeader');
      return { action: result.action, reason: result.reason, matchedRule: result.matchedRules[0].name };
    });

    await record('local waf evaluator blocks repeated bad bot requests consistently', async () => {
      const first = runtime.wafEvaluator.evaluate({
        policyName: appWafName,
        request: { method: 'GET', uri: '/mlops/model-registry', headers: { 'User-Agent': 'bad-bot/1.0' } },
      });
      const second = runtime.wafEvaluator.evaluate({
        policyName: appWafName,
        request: { method: 'GET', uri: '/mlops/model-registry', headers: { 'User-Agent': 'bad-bot/1.0' } },
      });
      assert.equal(first.action, 'Block');
      assert.equal(second.action, 'Block');
      assert.equal(first.matchedRules[0].name, 'BlockBadBotHeader');
      assert.equal(second.matchedRules[0].name, 'BlockBadBotHeader');
      return { action: second.action, matchedRule: second.matchedRules[0].name };
    });

    await record('waf policy get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', appWafPath(resourceGroup, appWafName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status };
    });

    await record('waf policy update can switch to detection mode', async () => {
      const result = await httpJson(armPort, 'PUT', appWafPath(resourceGroup, appWafName), appWafBody({ properties: { policySettings: { state: 'Enabled', mode: 'Detection', requestBodyCheck: true } } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.policySettings.mode, 'Detection');
      return { status: result.status };
    });

    await record('local waf evaluator detects bad bot without blocking in detection mode', async () => {
      const result = runtime.wafEvaluator.evaluate({
        policyName: appWafName,
        request: { method: 'GET', uri: '/mlops/model-registry', headers: { 'User-Agent': 'bad-bot/1.0' } },
      });
      assert.equal(result.action, 'Allow');
      assert.equal(result.reason, 'DetectionOnly');
      assert.equal(result.matchedRules[0].name, 'BlockBadBotHeader');
      return { action: result.action, reason: result.reason, matchedRule: result.matchedRules[0].name };
    });

    await record('local waf evaluator disabled policy bypasses rules', async () => {
      runtime.wafEvaluator.registerPolicy({
        policyName: `${appWafName}-disabled`,
        properties: appWafBody({ properties: { policySettings: { state: 'Disabled', mode: 'Prevention' } } }).properties,
      });
      const result = runtime.wafEvaluator.evaluate({
        policyName: `${appWafName}-disabled`,
        request: { method: 'GET', uri: '/mlops/model-registry', headers: { 'User-Agent': 'bad-bot/1.0' } },
      });
      assert.equal(result.action, 'Allow');
      assert.equal(result.reason, 'PolicyDisabled');
      return { action: result.action, reason: result.reason };
    });

    await record('waf policy list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'ApplicationGatewayWebApplicationFirewallPolicies', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === appWafName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('front door waf policy list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'FrontDoorWebApplicationFirewallPolicies', '2024-05-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === frontDoorWafName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('virtual network create succeeds for application gateway waf attachment', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody());
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('public ip create succeeds for application gateway waf attachment', async () => {
      const result = await httpJson(armPort, 'PUT', publicIpPath(resourceGroup, gatewayPublicIpName), publicIpBody(gatewayDomainLabel));
      assert.equal(result.status, 201);
      assert.match(String(result.body.properties?.dnsSettings?.fqdn ?? ''), /\.cloudapp\.azure\.com$/);
      return { status: result.status, fqdn: result.body.properties?.dnsSettings?.fqdn ?? null };
    });

    await record('waf policy update can switch back to prevention mode for application gateway traffic', async () => {
      const result = await httpJson(armPort, 'PUT', appWafPath(resourceGroup, appWafName), appWafBody({
        properties: {
          policySettings: {
            state: 'Enabled',
            mode: 'Prevention',
            requestBodyCheck: true,
          },
        },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.policySettings.mode, 'Prevention');
      return { status: result.status };
    });

    await record('application gateway create succeeds with attached waf policy', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, appGatewayName), applicationGatewayBody({
        resourceGroup,
        gatewayName: appGatewayName,
        subnetId: gatewaySubnetId,
        firewallPolicyId: appWafPolicyId,
      }));
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.firewallPolicy.id, appWafPolicyId);
      return { status: result.status, firewallPolicyId: result.body.properties.firewallPolicy.id };
    });

    await record('application gateway edge route blocks bad bot when firewall policy is attached', async () => {
      const result = await edgeJson(edgePort, 'GET', '/robotics/telemetry', {
        host: `${gatewayDomainLabel}.eastus.cloudapp.azure.com`,
        protocol: 'http',
        headers: { 'User-Agent': 'bad-bot/1.0' },
      });
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'WebApplicationFirewallRequestBlocked');
      assert.equal(result.headers['x-globalstack-waf-policy'], appWafName);
      return { status: result.status, errorCode: errorCode(result), wafPolicyName: result.headers['x-globalstack-waf-policy'] };
    });

    await record('cdn profile create succeeds for security policy parent', async () => {
      const result = await httpJson(armPort, 'PUT', cdnProfilePath(resourceGroup, profileName), cdnProfileBody());
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('waf policy update can switch back to prevention mode for attached security policy', async () => {
      const result = await httpJson(armPort, 'PUT', appWafPath(resourceGroup, appWafName), appWafBody({
        properties: {
          policySettings: {
            state: 'Enabled',
            mode: 'Prevention',
            requestBodyCheck: true,
          },
        },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.policySettings.mode, 'Prevention');
      return { status: result.status };
    });

    await record('afd endpoint create succeeds for security policy association', async () => {
      const result = await httpJson(armPort, 'PUT', afdEndpointPath(resourceGroup, profileName, afdEndpointName), {
        location: 'eastus',
        properties: {
          enabledState: 'Enabled',
        },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.hostName, `${afdEndpointName}.azurefd.net`);
      return { status: result.status, hostName: result.body.properties.hostName };
    });

    await record('cdn security policy collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/securityPolicies`, '2024-02-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, body, expectedCode] of [
      ['cdn security policy invalid name is rejected', cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId }), 'InvalidResourceName'],
      ['cdn security policy missing parameters is rejected', { properties: {} }, 'BadRequest'],
      ['cdn security policy invalid type is rejected', cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId, overrides: { properties: { parameters: { type: 'RateLimit' } } } }), 'BadRequest'],
      ['cdn security policy missing waf policy id is rejected', cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId, overrides: { properties: { parameters: { type: 'WebApplicationFirewall', associations: [{ domains: [{ id: endpointId }], patternsToMatch: ['/*'] }] } } } }), 'BadRequest'],
      ['cdn security policy wrong waf policy type is rejected', cdnSecurityPolicyBody({ wafPolicyId: appWafPolicyId, endpointId }), 'BadRequest'],
      ['cdn security policy missing association domains is rejected', cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId, overrides: { properties: { parameters: { type: 'WebApplicationFirewall', wafPolicy: { id: frontDoorWafPolicyId }, associations: [{ patternsToMatch: ['/*'] }] } } } }), 'BadRequest'],
      ['cdn security policy missing patterns is rejected', cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId, overrides: { properties: { parameters: { type: 'WebApplicationFirewall', wafPolicy: { id: frontDoorWafPolicyId }, associations: [{ domains: [{ id: endpointId }] }] } } } }), 'BadRequest'],
    ]) {
      await record(name, async () => {
        const pathName = name === 'cdn security policy invalid name is rejected' ? `-bad-${suffix}` : securityPolicyName;
        const result = await httpJson(armPort, 'PUT', cdnSecurityPolicyPath(resourceGroup, profileName, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('cdn security policy create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', cdnSecurityPolicyPath(resourceGroup, profileName, securityPolicyName), cdnSecurityPolicyBody({ wafPolicyId: frontDoorWafPolicyId, endpointId }));
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status };
    });

    await record('local front door edge route blocks bad bot when security policy references waf policy', async () => {
      const result = await edgeJson(edgePort, 'GET', '/robotics/telemetry', {
        host: `${afdEndpointName}.azurefd.net`,
        protocol: 'https',
        headers: {
          'User-Agent': 'bad-bot/1.0',
        },
      });
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'WebApplicationFirewallRequestBlocked');
      assert.equal(result.headers['x-globalstack-waf-policy'], frontDoorWafName);
      return { status: result.status, errorCode: errorCode(result), wafPolicyName: result.headers['x-globalstack-waf-policy'] };
    });

    await record('local front door edge route keeps blocking repeated bad bot requests', async () => {
      const first = await edgeJson(edgePort, 'GET', '/robotics/telemetry', {
        host: `${afdEndpointName}.azurefd.net`,
        protocol: 'https',
        headers: { 'User-Agent': 'bad-bot/1.0' },
      });
      const second = await edgeJson(edgePort, 'GET', '/robotics/telemetry', {
        host: `${afdEndpointName}.azurefd.net`,
        protocol: 'https',
        headers: { 'User-Agent': 'bad-bot/1.0' },
      });
      assert.equal(first.status, 403);
      assert.equal(second.status, 403);
      assert.equal(errorCode(first), 'WebApplicationFirewallRequestBlocked');
      assert.equal(errorCode(second), 'WebApplicationFirewallRequestBlocked');
      assert.equal(first.headers['x-globalstack-waf-policy'], frontDoorWafName);
      assert.equal(second.headers['x-globalstack-waf-policy'], frontDoorWafName);
      return { status: second.status, wafPolicyName: second.headers['x-globalstack-waf-policy'] };
    });

    await record('cdn security policy get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', cdnSecurityPolicyPath(resourceGroup, profileName, securityPolicyName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, `${profileName}/${securityPolicyName}`);
      return { status: result.status };
    });

    await record('cdn security policy list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/securityPolicies`, '2024-02-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${profileName}/${securityPolicyName}`));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, method, path] of [
      ['unsupported waf attach action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.Network', `ApplicationGatewayWebApplicationFirewallPolicies/${appWafName}/attachWafPolicyToAgc`, '2023-09-01')],
      ['unsupported waf managed rules route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.Network', `ApplicationGatewayWebApplicationFirewallPolicies/${appWafName}/managedRules`, '2023-09-01')],
      ['unsupported cdn security policy child route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/securityPolicies/${securityPolicyName}/associations`, '2024-02-01')],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'POST' ? {} : undefined);
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create waf policies', async () => {
      const deploymentName = `waf-deploy-${suffix}`;
      const deploymentProfile = `cdn-waf-deploy-${suffix}`.slice(0, 40);
      const deploymentFrontDoorWaf = `fdwaf-deploy-${suffix}`.slice(0, 40);
      const deploymentSecurity = `security-deploy-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({ resourceGroup, frontDoorWafName: deploymentFrontDoorWaf, profileName: deploymentProfile, securityPolicyName: deploymentSecurity }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/FrontDoorWebApplicationFirewallPolicies/${deploymentFrontDoorWaf}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/securityPolicies/${deploymentSecurity}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('cdn security policy delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', cdnSecurityPolicyPath(resourceGroup, profileName, securityPolicyName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('cdn security policy get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', cdnSecurityPolicyPath(resourceGroup, profileName, securityPolicyName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cdn security policy delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', cdnSecurityPolicyPath(resourceGroup, profileName, missingPolicyName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('waf policy delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', appWafPath(resourceGroup, appWafName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('front door waf policy delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', frontDoorWafPath(resourceGroup, frontDoorWafName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('waf policy get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', appWafPath(resourceGroup, appWafName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('front door waf policy get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', frontDoorWafPath(resourceGroup, frontDoorWafName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  const dataPlaneCaseNames = new Set([
    'local waf evaluator allows clean request',
    'local waf evaluator blocks bad bot in prevention mode',
    'local waf evaluator blocks repeated bad bot requests consistently',
    'local front door waf evaluator blocks bad bot in prevention mode',
    'local waf evaluator detects bad bot without blocking in detection mode',
    'local waf evaluator disabled policy bypasses rules',
    'application gateway edge route blocks bad bot when firewall policy is attached',
    'local front door edge route blocks bad bot when security policy references waf policy',
    'local front door edge route keeps blocking repeated bad bot requests',
  ]);
  const dataPlaneCases = cases.filter(item => dataPlaneCaseNames.has(item.name));
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    controlPlane: {
      ok: failed.length === 0,
      total: cases.length,
      failedCount: failed.length,
      resourceGroup,
      appWafName,
      profileName,
      securityPolicyName,
      cases,
    },
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      appWafName,
      profileName,
      cases: dataPlaneCases,
    },
  };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return {
      ok: true,
      skipped: true,
      reason: '--skip-platforms was provided',
      expectedPlatforms: azurePlatforms.length,
      results: [],
    };
  }

  const env = {
    ...process.env,
    PROVIDER: 'GlobalStack',
    CLOUD_PROVIDER: 'GlobalStack',
  };
  const result = await run('npm', ['run', 'smoke:platform-runners'], { env, timeoutMs: 1800000 });
  const resultsPath = join(root, 'dist', 'platform-lifecycle-smoke-results.json');
  const summary = await readJson(resultsPath).catch(() => ({ generatedAt: null, results: [] }));
  const failed = (summary.results ?? []).filter(item => !item.ok);
  return {
    ok: result.code === 0 && failed.length === 0 && (summary.results ?? []).length === azurePlatforms.length,
    skipped: false,
    exitCode: result.code,
    expectedPlatforms: azurePlatforms.length,
    passedCount: (summary.results ?? []).length - failed.length,
    failedCount: failed.length,
    resultsPath,
    results: summary.results ?? [],
  };
}

function markdown(report) {
  const lines = [
    '# Azure WAF Policy Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- WAF policy under test: ${report.controlPlane.appWafName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Data Plane');
  lines.push('');
  lines.push(`- Passed: ${report.dataPlane.total - report.dataPlane.failedCount}/${report.dataPlane.total}`);
  lines.push(`- WAF policy under test: ${report.dataPlane.appWafName}`);
  lines.push('');
  lines.push('| Case | Status | HTTP | Error |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Platform Matrix');
  lines.push('');
  if (report.platformMatrix.skipped) {
    lines.push(`- Skipped: ${report.platformMatrix.reason}`);
  } else {
    lines.push(`- Passed: ${report.platformMatrix.passedCount}/${report.platformMatrix.expectedPlatforms}`);
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Azure Application Gateway WAF policy and CDN security policy ARM lifecycle, bounded local custom-rule evaluation, stricter parameter rejection, unsupported WAF child/action routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark WAF as 99%-complete or cloudValidated for full managed rule execution, bot protection, exclusions, per-rule overrides, WAF attachment runtime behavior, request blocking/logging semantics, throttling, RBAC, or exact Azure edge/runtime behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const parity = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: parity.controlPlane.ok && parity.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Application Gateway WAF policy and CDN security policy ARM lifecycle, bounded local custom-rule evaluation, validation, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure WAF cloudValidated claim.',
  controlPlane: parity.controlPlane,
  dataPlane: parity.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure WAF Policy parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
