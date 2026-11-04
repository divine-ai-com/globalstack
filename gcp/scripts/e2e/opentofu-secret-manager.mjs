import { runSecretManagerLifecycle } from './tf-family-secret-manager.mjs';

await runSecretManagerLifecycle({
  argv: process.argv.slice(2),
  cliName: 'opentofu',
  binaryArg: 'opentofu',
  binaryEnv: 'OPENTOFU_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/tofu',
  runIdPrefix: 'tofu-secret',
});
