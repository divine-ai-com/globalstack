import { runLoggingLifecycle } from './tf-family-logging.mjs';

await runLoggingLifecycle({
  argv: process.argv.slice(2),
  cliName: 'terraform',
  binaryArg: 'terraform',
  binaryEnv: 'TERRAFORM_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/terraform',
  runIdPrefix: 'tf-logging',
});
