import { spawn } from 'node:child_process';
import { createServer, request as httpsRequest } from 'node:https';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmRequestHandler } from '../packages/azure-control-plane/src/server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const toolName = process.argv[2];
const trialArg = process.argv[3];

if (!['terraform', 'tofu'].includes(toolName) || !trialArg) {
  throw new Error('Usage: node scripts/native-deploy-hcl-cli.mjs <terraform|tofu> <trial-dir>');
}

const trialDir = resolve(root, trialArg);
const workingDir = join(trialDir, 'lib');
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const tenantId = process.env.ARM_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
const clientId = process.env.ARM_CLIENT_ID ?? '11111111-1111-1111-1111-111111111111';
const port = Number(process.env.GLOBALSTACK_NATIVE_HCL_PORT ?? (toolName === 'terraform' ? 4583 : 4584));
const endpoint = `https://127.0.0.1:${port}`;
const certDir = join(root, '.tools', 'certs');
const certPath = join(certDir, 'globalstack.crt');
const keyPath = join(certDir, 'globalstack.key');
const binDir = join(root, '.tools', 'bin');
const toolPath = join(binDir, toolName);
const shimDir = join(root, '.tools', 'native-shims', toolName);
const azShim = join(shimDir, 'az');
const azCallsLog = join(trialDir, `native-${toolName}-az-calls.log`);
const reportPath = join(trialDir, `native-${toolName}-report.json`);

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

async function ensureTooling() {
  if (!existsSync(toolPath)) throw new Error(`${toolName} is not installed at ${toolPath}`);
  await mkdir(certDir, { recursive: true });
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    const cert = await run('openssl', [
      'req',
      '-x509',
      '-newkey', 'rsa:2048',
      '-sha256',
      '-days', '3650',
      '-nodes',
      '-keyout', keyPath,
      '-out', certPath,
      '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ]);
    if (cert.code !== 0) throw new Error(`openssl certificate generation failed: ${cert.stderr}`);
  }

  await mkdir(shimDir, { recursive: true });
  await writeFile(azShim, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(azCallsLog)}
if [ "$1" = "account" ] && [ "$2" = "get-access-token" ]; then
  cat <<JSON
{"accessToken":"globalstack-local-token","expiresOn":"2099-01-01 00:00:00.000000","expires_on":4070908800,"subscription":"${subscriptionId}","tenant":"${tenantId}","tokenType":"Bearer"}
JSON
  exit 0
fi
if [ "$1" = "account" ] && [ "$2" = "show" ]; then
  cat <<JSON
{"id":"${subscriptionId}","tenantId":"${tenantId}","name":"GlobalStack Local Subscription","state":"Enabled","user":{"type":"servicePrincipal","name":"${clientId}"}}
JSON
  exit 0
fi
if [ "$1" = "version" ]; then
  echo '{"azure-cli":"2.99.0"}'
  exit 0
fi
echo "globalstack az shim: unsupported $*" >&2
exit 1
`);
  await chmod(azShim, 0o755);
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const healthy = await new Promise((resolve) => {
      const req = httpsRequest(`${endpoint}/_globalstack/health`, {
        ca: existsSync(certPath) ? undefined : undefined,
        rejectUnauthorized: false,
      }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.end();
    });
    if (healthy) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`GlobalStack HTTPS ARM facade did not become healthy at ${endpoint}`);
}

function nativeEnv() {
  return {
    ...process.env,
    PATH: `${shimDir}:${binDir}:${process.env.PATH}`,
    SSL_CERT_FILE: certPath,
    ARM_SUBSCRIPTION_ID: subscriptionId,
    ARM_TENANT_ID: tenantId,
    ARM_USE_CLI: 'true',
    ARM_RESOURCE_MANAGER_ENDPOINT: `${endpoint}/`,
    AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY: 'true',
    TF_IN_AUTOMATION: '1',
  };
}

function redact(text) {
  return String(text ?? '').replaceAll('globalstack-local-token', '<local-token>');
}

await ensureTooling();
const server = createServer({
  key: await readFile(keyPath),
  cert: await readFile(certPath),
}, createArmRequestHandler());

await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

let report = {
  tool: toolName,
  status: 'FAIL',
  endpoint,
  trialDir,
};

try {
  await waitForHealth();
  const env = nativeEnv();
  const version = await run(toolPath, ['version'], { cwd: workingDir, env });
  const init = await run(toolPath, ['init', '-input=false'], { cwd: workingDir, env });
  const validate = init.code === 0
    ? await run(toolPath, ['validate', '-no-color'], { cwd: workingDir, env })
    : { code: 1, stdout: '', stderr: 'skipped because init failed' };
  const apply = validate.code === 0
    ? await run(toolPath, ['apply', '-auto-approve', '-input=false', '-refresh=false', '-no-color'], { cwd: workingDir, env })
    : { code: 1, stdout: '', stderr: 'skipped because validate failed' };
  const destroy = apply.code === 0
    ? await run(toolPath, ['destroy', '-auto-approve', '-input=false', '-refresh=false', '-no-color'], { cwd: workingDir, env })
    : await run(toolPath, ['destroy', '-auto-approve', '-input=false', '-refresh=false', '-no-color'], { cwd: workingDir, env });

  report = {
    tool: toolName,
    status: init.code === 0 && validate.code === 0 && apply.code === 0 ? 'PASS' : 'FAIL',
    endpoint,
    trialDir,
    cleanupStatus: destroy.code === 0 ? 'PASS' : 'FAIL',
    commands: {
      init: `${toolName} init -input=false`,
      validate: `${toolName} validate -no-color`,
      apply: `${toolName} apply -auto-approve -input=false -refresh=false -no-color`,
      destroy: `${toolName} destroy -auto-approve -input=false -refresh=false -no-color`,
    },
    auth: {
      mode: 'azure-cli-token-shim',
      subscriptionId,
      tenantId,
      clientId,
      token: '<local-token>',
    },
    version: {
      code: version.code,
      stdout: redact(version.stdout),
      stderr: redact(version.stderr),
    },
    init: {
      code: init.code,
      stdout: redact(init.stdout),
      stderr: redact(init.stderr),
    },
    validate: {
      code: validate.code,
      stdout: redact(validate.stdout),
      stderr: redact(validate.stderr),
    },
    apply: {
      code: apply.code,
      stdout: redact(apply.stdout),
      stderr: redact(apply.stderr),
    },
    destroy: {
      code: destroy.code,
      stdout: redact(destroy.stdout),
      stderr: redact(destroy.stderr),
    },
  };
  if (report.status !== 'PASS' || report.cleanupStatus !== 'PASS') process.exitCode = 1;
} finally {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await new Promise(resolve => server.close(resolve));
}

console.log(JSON.stringify({
  tool: report.tool,
  status: report.status,
  cleanupStatus: report.cleanupStatus,
  reportPath,
  endpoint,
}, null, 2));
