import { runAzureDifferential } from '../../packages/differential/src/azure-runner.mjs';

const result = await runAzureDifferential(process.argv.slice(2));
if (!result.ok) process.exit(1);
