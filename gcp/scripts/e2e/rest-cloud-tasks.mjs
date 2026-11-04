import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { runLocalRestGate, expectStatus } from './lib/local-rest-gate.mjs';
import { CloudTasksApi } from '../../src/services/cloud-tasks/google-api.mjs';

await runLocalRestGate({
  gate: 'rest-cloud-tasks',
  service: 'cloud-tasks',
  execute: async ({ client, endpoint, runId, step }) => {
    const receiver = await startReceiver();
    const projectId = 'globalstack-local';
    const location = 'us-central1';
    const queueId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
    const taskId = 'deliver-workflow-event';
    const tasks = new CloudTasksApi(client, {
      tasksRoot: `${endpoint}/v2`,
    });

    try {
      await step('create queue with rate and retry config', () => tasks.createQueue({
        projectId,
        location,
        queueId,
        rateLimits: {
          maxDispatchesPerSecond: 5,
        },
        retryConfig: {
          maxAttempts: 3,
        },
      }), exchange => {
        expectStatus(200)(exchange);
        assert.equal(exchange.response.body.state, 'RUNNING');
      });
      await step('get queue', () => tasks.getQueue({ projectId, location, queueId }), expectStatus(200));
      await step('create http task', () => tasks.createHttpTask({
        projectId,
        location,
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
      }), expectStatus(200));
      await step('get scheduled task', () => tasks.getTask({
        projectId,
        location,
        queueId,
        taskId,
      }), exchange => {
        expectStatus(200)(exchange);
        assert.equal(exchange.response.body.status, 'SCHEDULED');
      });
      await step('run task and dispatch to receiver', () => tasks.runTask({
        projectId,
        location,
        queueId,
        taskId,
      }), exchange => {
        expectStatus(200)(exchange);
        assert.equal(exchange.response.body.status, 'SUCCEEDED');
        assert.equal(exchange.response.body.dispatchCount, 1);
        assert.equal(exchange.response.body.responseCount, 1);
      });
      const delivery = await step('verify receiver delivery body and headers', () => receiver.nextDelivery(), delivery => {
        assert.equal(delivery.headers['x-run-id'], runId);
        assert.deepEqual(JSON.parse(delivery.body), {
          run_id: runId,
          action: 'dispatch',
        });
      });

      return {
        project_id: projectId,
        location,
        queue_id: queueId,
        task_id: taskId,
        receiver_path: delivery.path,
        dispatch_verified: true,
      };
    } finally {
      await receiver.close();
    }
  },
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
      path: request.url,
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
