import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const root = workspaceRoot(import.meta.url);
const trialDir = resolve(root, process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node scripts/native-deploy-bicep-cli.mjs <trial-dir>');

const subscriptionId = process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const tenantId = process.env.ARM_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
const clientId = process.env.ARM_CLIENT_ID ?? '11111111-1111-1111-1111-111111111111';
const clientSecret = process.env.ARM_CLIENT_SECRET ?? 'globalstack';
const port = Number(process.env.GLOBALSTACK_NATIVE_CLI_PORT ?? 4581);
const endpoint = `http://127.0.0.1:${port}`;

function run(command, args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolveRun({ code: code ?? 1, stdout, stderr }));
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`${endpoint}/_globalstack/health`).catch(() => null);
    if (response?.ok) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`GlobalStack ARM facade did not become healthy at ${endpoint}`);
}

async function requestLocalAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://management.azure.com/.default',
  });
  const response = await fetch(`${endpoint}/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) throw new Error(`GlobalStack local Azure token request failed with HTTP ${response.status}: ${JSON.stringify(token)}`);
  return token;
}

const server = createArmServer();
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

let report;
try {
  await waitForHealth();
  const token = await requestLocalAccessToken();
  await writeFile(join(trialDir, 'native-cli-token-response.json'), `${JSON.stringify({
    token_type: token.token_type,
    expires_in: token.expires_in,
    expires_on: token.expires_on,
    access_token: '<redacted>',
  }, null, 2)}\n`);
  const bicepPath = join(trialDir, 'lib', 'main.bicep');
  const armPath = join(trialDir, 'lib', 'main.azuredeploy.json');
  const parametersPath = join(trialDir, 'lib', 'parameters.json');

  const build = await run('az', ['bicep', 'build', '--file', bicepPath, '--outfile', armPath]);
  if (build.code !== 0) {
    report = {
      status: 'FAIL',
      stage: 'az bicep build',
      command: `az bicep build --file ${bicepPath} --outfile ${armPath}`,
      stdout: build.stdout,
      stderr: build.stderr,
    };
    await writeFile(join(trialDir, 'native-cli-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } else {
    const template = JSON.parse(await readFile(armPath, 'utf8'));
    const parametersFile = JSON.parse(await readFile(parametersPath, 'utf8'));
    const resourceGroupName = parametersFile.parameters?.resourceGroupName?.value;
    const bodyPath = join(trialDir, 'native-cli-deployment-body.json');
    await writeFile(bodyPath, `${JSON.stringify({
      location: parametersFile.parameters?.location?.value ?? process.env.AZURE_LOCATION ?? 'eastus',
      properties: {
        mode: 'Incremental',
        template,
        parameters: parametersFile.parameters,
      },
    }, null, 2)}\n`);

    const deploy = await run('az', [
      'rest',
      '--method', 'put',
      '--url', `${endpoint}/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/bicep-native-trial?api-version=2022-09-01`,
      '--body', `@${bodyPath}`,
      '--headers', 'content-type=application/json', `Authorization=Bearer ${token.access_token}`,
      '--skip-authorization-header',
      '-o', 'json',
    ]);

    let deploymentResponse = null;
    try {
      deploymentResponse = deploy.stdout ? JSON.parse(deploy.stdout) : null;
    } catch {
      deploymentResponse = deploy.stdout;
    }
    await writeFile(join(trialDir, 'native-cli-deployment-response.json'), `${typeof deploymentResponse === 'string' ? deploymentResponse : JSON.stringify(deploymentResponse, null, 2)}\n`);

    const cleanup = resourceGroupName
      ? await run('az', [
        'rest',
        '--method', 'delete',
        '--url', `${endpoint}/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}?api-version=2021-04-01`,
        '--headers', `Authorization=Bearer ${token.access_token}`,
        '--skip-authorization-header',
        '-o', 'json',
      ])
      : { code: 1, stdout: '', stderr: 'resourceGroupName parameter missing' };

    report = {
      status: deploy.code === 0 ? 'PASS' : 'FAIL',
      stage: deploy.code === 0 ? 'complete' : 'az rest deployment',
      deploymentProvisioningState: deploymentResponse?.properties?.provisioningState,
      deploymentStepCount: deploymentResponse?.properties?.globalstackDeploymentSteps?.length ?? 0,
      cleanupStatus: cleanup.code === 0 ? 'PASS' : 'FAIL',
      commands: {
        build: `az bicep build --file ${bicepPath} --outfile ${armPath}`,
        token: `POST ${endpoint}/${tenantId}/oauth2/v2.0/token with client_credentials for local Azure identity ${clientId}`,
        deploy: `az rest --method put --url ${endpoint}/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/bicep-native-trial?api-version=2022-09-01 --body @${bodyPath} --headers content-type=application/json Authorization='Bearer <local-token>' --skip-authorization-header -o json`,
      },
      stdout: deploy.stdout,
      stderr: deploy.stderr,
      cleanupStdout: cleanup.stdout,
      cleanupStderr: cleanup.stderr,
    };
    await writeFile(join(trialDir, 'native-cli-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (report.status !== 'PASS' || report.cleanupStatus !== 'PASS') process.exitCode = 1;
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}

console.log(JSON.stringify(report, null, 2));
