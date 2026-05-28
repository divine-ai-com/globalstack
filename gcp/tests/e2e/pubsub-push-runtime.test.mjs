import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { decodePubSubMessageData, PubSubApi } from '../../src/services/pubsub/google-api.mjs';
import { startPubSubEmulator } from '../../src/services/pubsub/emulator-engine.mjs';

test('Pub/Sub official emulator delivers push subscription messages to a local HTTP runtime', async () => {
  const runId = createRunId('pubsub-push');
  const projectId = 'globalstack-local';
  const topicName = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const subscriptionName = `gst-push-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const received = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/pubsub/push') {
      response.writeHead(404);
      response.end();
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(204);
    response.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const emulator = await startPubSubEmulator();
  const pubsub = new PubSubApi(new GoogleRestClient({
    tokenProvider: async () => 'local-test-token',
  }), {
    pubsubRoot: `http://${emulator.endpoint}/v1`,
  });

  try {
    const createTopic = await pubsub.createTopic({ projectId, topicName, labels: labels(runId) });
    assert.equal(createTopic.response.status, 200);
    const createSubscription = await pubsub.createSubscription({
      projectId,
      subscriptionName,
      topicName,
      labels: labels(runId),
      body: {
        pushConfig: {
          pushEndpoint: `http://127.0.0.1:${port}/pubsub/push`,
          attributes: {
            'x-goog-version': 'v1',
          },
        },
      },
    });
    assert.equal(createSubscription.response.status, 200);
    assert.equal(createSubscription.response.body.pushConfig.pushEndpoint, `http://127.0.0.1:${port}/pubsub/push`);

    const publish = await pubsub.publish({
      projectId,
      topicName,
      messages: [{
        data: {
          run_id: runId,
          delivery: 'push',
        },
        attributes: {
          run_id: runId,
        },
      }],
    });
    assert.equal(publish.response.status, 200);

    const pushed = await waitFor(() => received.at(0), 10000);
    assert.equal(pushed.subscription, `projects/${projectId}/subscriptions/${subscriptionName}`);
    assert.equal(pushed.message.attributes.run_id, runId);
    assert.deepEqual(decodePubSubMessageData(pushed.message), {
      run_id: runId,
      delivery: 'push',
    });
  } finally {
    await pubsub.deleteSubscription({ projectId, subscriptionName }).catch(() => {});
    await pubsub.deleteTopic({ projectId, topicName }).catch(() => {});
    await emulator.stop();
    await new Promise(resolve => server.close(resolve));
  }
});

function labels(runId) {
  return {
    purpose: 'globalstack-conformance',
    owner: 'globalstack',
    run_id: runId,
  };
}

async function waitFor(readValue, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = readValue();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}
