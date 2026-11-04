import { startArmServer } from '../../packages/azure-control-plane/src/server.mjs';

// Local development uses Azure-shaped request authentication without activation.
const server = startArmServer({ requireProductAuth: false });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections?.();
    server.close();
  });
}
server.on('error', error => {
  console.error(`Unable to start GlobalStack: ${error.message}`);
  process.exitCode = 1;
});
