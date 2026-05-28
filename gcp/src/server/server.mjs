import http from 'node:http';
import { createRouter } from '../router/router.mjs';
import { createDefaultServices } from '../services/index.mjs';

export function createServer({ services = createDefaultServices() } = {}) {
  return http.createServer(createRouter({ services }));
}

export async function listen({ host = '127.0.0.1', port = 8765, services = createDefaultServices() } = {}) {
  const server = createServer({ services });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    server,
    url: `http://${host}:${server.address().port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
}
