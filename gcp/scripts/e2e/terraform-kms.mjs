import { runKmsLifecycle } from './tf-family-kms.mjs';

await runKmsLifecycle({
  argv: process.argv.slice(2),
  cliName: 'terraform',
  binaryArg: 'terraform',
  binaryEnv: 'TERRAFORM_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/terraform',
  runIdPrefix: 'tf-kms',
});
