import { runKmsLifecycle } from './tf-family-kms.mjs';

await runKmsLifecycle({
  argv: process.argv.slice(2),
  cliName: 'opentofu',
  binaryArg: 'opentofu',
  binaryEnv: 'OPENTOFU_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/tofu',
  runIdPrefix: 'tofu-kms',
});
