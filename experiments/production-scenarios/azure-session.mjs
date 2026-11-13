import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

export function azureDockerArguments(config, args, certificate = process.env.PAIRED_AZURE_CERTIFICATE_FILE) {
  assert.ok(config?.startsWith('/'), 'An absolute existing Azure CLI config directory is required');
  assert.ok(statSync(config).isDirectory(), 'Azure CLI configuration must be a directory');
  const mounts = ['-v', `${config}:/azure`];
  assert.ok(!config.includes(':'), 'Invalid config mount path');
  if (certificate) {
    assert.ok(certificate.startsWith('/') && !certificate.includes(':'), 'An absolute certificate file is required');
    const info = statSync(certificate);
    assert.ok(info.isFile() && (info.mode & 0o077) === 0, 'Private certificate must be owner-accessible only');
    // Azure CLI retains this container path in its service-principal profile.
    mounts.push('-v', `${certificate}:/credential/pilot-login.pem:ro`);
  }
  return ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`,
    '-e', 'HOME=/tmp', '-e', 'AZURE_CONFIG_DIR=/azure', '-e', 'AZURE_CORE_COLLECT_TELEMETRY=no',
    ...mounts, '--entrypoint', 'az', 'globalstack/validation-runner:cli-pinned',
    ...args, '--output', 'json', '--only-show-errors'];
}

export function azureCli(config, args) {
  const dockerArgs = azureDockerArguments(config, args);
  try { return JSON.parse(execFileSync('docker', dockerArgs, {
    encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
  })); } catch {
    // CLI diagnostics can contain account details or credential-bearing output.
    throw new Error('The existing Azure CLI session could not complete the requested command.');
  }
}

export function azureToken(config) {
  return azureCli(config, ['account', 'get-access-token', '--resource', 'https://management.azure.com/']).accessToken;
}
