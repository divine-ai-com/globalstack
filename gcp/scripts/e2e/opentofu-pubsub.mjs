import { runPubSubLifecycle } from './tf-family-pubsub.mjs';

await runPubSubLifecycle({
  argv: process.argv.slice(2),
  cliName: 'opentofu',
  binaryArg: 'tofu',
  binaryEnv: 'TOFU_BIN',
  defaultBinary: '/home/ubuntu/.local/bin/tofu',
  runIdPrefix: 'tofu-pubsub',
});
