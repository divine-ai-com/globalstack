import { runCloudStorageLifecycle } from './tf-family-cloud-storage.mjs';

await runCloudStorageLifecycle({
  argv: process.argv.slice(2),
  cliName: 'terraform',
  binaryArg: 'terraform',
  binaryEnv: 'TERRAFORM_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/terraform',
  runIdPrefix: 'tf-storage',
  objectPurpose: 'globalstack gcp terraform',
});
