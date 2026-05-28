import { listen } from '../server/server.mjs';
import { listServices } from '../services/catalog.mjs';
import { createDefaultServices } from '../services/index.mjs';

function parseArgs(argv) {
  const args = {
    host: '127.0.0.1',
    port: 8765,
  };
  for (const arg of argv) {
    if (arg.startsWith('--host=')) {
      args.host = arg.slice('--host='.length);
      continue;
    }
    if (arg.startsWith('--port=')) {
      args.port = Number(arg.slice('--port='.length));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const runtime = await listen({
  ...args,
  services: createDefaultServices(),
});
console.log(JSON.stringify({
  status: 'listening',
  url: runtime.url,
  services: listServices().map(service => ({
    key: service.key,
    supportClass: service.supportClass,
  })),
}, null, 2));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await runtime.close();
    process.exit(0);
  });
}
