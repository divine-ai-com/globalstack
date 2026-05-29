import { runLoggingLifecycle } from './tf-family-logging.mjs';

await runLoggingLifecycle({
  argv: process.argv.slice(2),
  cliName: 'opentofu',
  binaryArg: 'opentofu',
  binaryEnv: 'OPENTOFU_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/tofu',
  runIdPrefix: 'tofu-logging',
});
