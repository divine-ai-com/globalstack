import { runSecretManagerLifecycle } from './tf-family-secret-manager.mjs';

await runSecretManagerLifecycle({
  argv: process.argv.slice(2),
  cliName: 'terraform',
  binaryArg: 'terraform',
  binaryEnv: 'TERRAFORM_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/terraform',
  runIdPrefix: 'tf-secret',
});
