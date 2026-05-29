import { runCloudTasksLifecycle } from './tf-family-cloud-tasks.mjs';

await runCloudTasksLifecycle({
  argv: process.argv.slice(2),
  cliName: 'terraform',
  binaryArg: 'terraform',
  binaryEnv: 'TERRAFORM_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/terraform',
  runIdPrefix: 'tf-tasks',
});
