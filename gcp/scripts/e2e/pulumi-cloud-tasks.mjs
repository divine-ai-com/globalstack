import http from 'node:http';
import { once } from 'node:events';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { CloudTasksApi } from '../../src/services/cloud-tasks/google-api.mjs';
import { runPulumiLocalLifecycle } from './lib/pulumi-local-lifecycle.mjs';

const templateDir = new URL('../../templates/pulumi/cloud-tasks/', import.meta.url);

await runPulumiLocalLifecycle({
  argv: process.argv.slice(2),
  templateDir,
  runIdPrefix: 'pulumi-tasks',
  configure: async ({ runId }) => {
    const runtime = await listen({ port: 0 });
    const receiver = await startReceiver();
    const queueId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
    return {
      runtime,
      receiver,
      queueId,
      taskId: 'dispatch-workflow',
      env: {
        GOOGLE_CLOUD_TASKS_CUSTOM_ENDPOINT: `${runtime.url}/v2/`,
      },
      config: {
        projectId: 'globalstack-local',
        location: 'us-central1',
        queueId,
        cloudTasksEndpoint: `${runtime.url}/v2/`,
      },
      cleanup: async () => {
        await receiver.close();
        await runtime.close();
      },
    };
  },
  afterUp: async ({ runtime, receiver, runId, queueId, taskId }) => {
    const api = new CloudTasksApi(new GoogleRestClient({ tokenProvider: async () => null }), {
      tasksRoot: `${runtime.url}/v2`,
    });
    await api.createHttpTask({
      projectId: 'globalstack-local',
      location: 'us-central1',
      queueId,
      taskId,
      url: `${receiver.url}/tasks`,
      headers: {
        'content-type': 'application/json',
        'x-run-id': runId,
      },
      body: JSON.stringify({
        run_id: runId,
        action: 'dispatch',
      }),
    });
    const runTask = await api.runTask({ projectId: 'globalstack-local', location: 'us-central1', queueId, taskId });
    const delivery = await receiver.nextDelivery();
    if (runTask.response.body.status !== 'SUCCEEDED' || delivery.headers['x-run-id'] !== runId) {
      throw new Error(`Pulumi Cloud Tasks dispatch check failed for ${queueId}`);
    }
  },
  report: ({ context }) => ({
    queue_id: context?.queueId,
    task_id: context?.taskId,
    endpoint: context?.runtime ? `${context.runtime.url}/v2/` : null,
  }),
});

async function startReceiver() {
  const deliveries = [];
  const waiters = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/tasks') {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const delivery = {
      headers: request.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    };
    deliveries.push(delivery);
    waiters.shift()?.(delivery);
    response.writeHead(204);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    nextDelivery() {
      if (deliveries.length) return Promise.resolve(deliveries.shift());
      return new Promise(resolve => waiters.push(resolve));
    },
    close() {
      return new Promise(resolve => server.close(resolve));
    },
  };
}
