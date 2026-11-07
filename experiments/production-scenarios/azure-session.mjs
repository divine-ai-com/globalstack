import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export function azureCli(config, args) {
  assert.ok(config?.startsWith('/'), 'An absolute existing Azure CLI config directory is required');
  try { return JSON.parse(execFileSync('docker', ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`,
    '-e', 'HOME=/tmp', '-e', 'AZURE_CONFIG_DIR=/azure', '-e', 'AZURE_CORE_COLLECT_TELEMETRY=no',
    '-v', `${config}:/azure`, '--entrypoint', 'az', 'globalstack/validation-runner:cli-pinned',
    ...args, '--output', 'json', '--only-show-errors'], {
    encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'],
  })); } catch {
    // CLI diagnostics can contain account details or credential-bearing output.
    throw new Error('The existing Azure CLI session could not complete the requested command.');
  }
}

export function azureToken(config) {
  return azureCli(config, ['account', 'get-access-token', '--resource', 'https://management.azure.com/']).accessToken;
}
