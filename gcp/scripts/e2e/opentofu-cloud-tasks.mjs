import { runCloudTasksLifecycle } from './tf-family-cloud-tasks.mjs';

await runCloudTasksLifecycle({
  argv: process.argv.slice(2),
  cliName: 'opentofu',
  binaryArg: 'opentofu',
  binaryEnv: 'OPENTOFU_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/tofu',
  runIdPrefix: 'tofu-tasks',
});
