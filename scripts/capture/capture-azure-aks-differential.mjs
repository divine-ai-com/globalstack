import { runAzureDifferential } from '../../packages/differential/src/azure-runner.mjs';

const forwardedArgs = process.argv.slice(2);
if (!forwardedArgs.some(arg => arg.startsWith('--scenario='))) {
  forwardedArgs.unshift('--scenario=aks-metadata');
}
if (!forwardedArgs.some(arg => arg.startsWith('--target='))) {
  forwardedArgs.unshift('--target=azure');
}

const result = await runAzureDifferential(forwardedArgs);
if (!result.ok) process.exit(1);
