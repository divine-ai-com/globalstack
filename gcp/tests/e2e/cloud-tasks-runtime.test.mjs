import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { CloudTasksApi } from '../../src/services/cloud-tasks/google-api.mjs';

test('Cloud Tasks local runtime creates a queue and dispatches an HTTP task to a real endpoint', async () => {
  const runtime = await listen({ port: 0 });
  const receiver = await startReceiver();
  const runId = createRunId('tasks-runtime');
  const projectId = 'globalstack-local';
  const location = 'us-central1';
  const queueId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
  const taskId = 'deliver-workflow-event';
  const tasks = new CloudTasksApi(new GoogleRestClient({
    tokenProvider: async () => null,
  }), {
    tasksRoot: `${runtime.url}/v2`,
  });

  try {
    const createQueue = await tasks.createQueue({
      projectId,
      location,
      queueId,
      rateLimits: {
        maxDispatchesPerSecond: 5,
      },
      retryConfig: {
        maxAttempts: 3,
      },
    });
    assert.equal(createQueue.response.status, 200);
    assert.equal(createQueue.response.body.state, 'RUNNING');

    const getQueue = await tasks.getQueue({ projectId, location, queueId });
    assert.equal(getQueue.response.status, 200);

    const createTask = await tasks.createHttpTask({
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
    });
    assert.equal(createTask.response.status, 200);
    assert.match(createTask.response.body.name, new RegExp(`/tasks/${taskId}$`));

    const getTask = await tasks.getTask({ projectId, location, queueId, taskId });
    assert.equal(getTask.response.status, 200);
    assert.equal(getTask.response.body.status, 'SCHEDULED');

    const runTask = await tasks.runTask({ projectId, location, queueId, taskId });
    assert.equal(runTask.response.status, 200);
    assert.equal(runTask.response.body.status, 'SUCCEEDED');
    assert.equal(runTask.response.body.dispatchCount, 1);
    assert.equal(runTask.response.body.responseCount, 1);

    const delivery = await receiver.nextDelivery();
    assert.equal(delivery.headers['x-run-id'], runId);
    assert.deepEqual(JSON.parse(delivery.body), {
      run_id: runId,
      action: 'dispatch',
    });
  } finally {
    await receiver.close();
    await runtime.close();
  }
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
