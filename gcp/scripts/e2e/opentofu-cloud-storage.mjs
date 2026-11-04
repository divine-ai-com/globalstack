import { runCloudStorageLifecycle } from './tf-family-cloud-storage.mjs';

await runCloudStorageLifecycle({
  argv: process.argv.slice(2),
  cliName: 'opentofu',
  binaryArg: 'tofu',
  binaryEnv: 'TOFU_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/tofu',
  runIdPrefix: 'tofu-storage',
  objectPurpose: 'globalstack gcp opentofu',
});
