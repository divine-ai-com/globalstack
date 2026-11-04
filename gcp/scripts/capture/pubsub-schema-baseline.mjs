import { CleanupStack } from '../../src/conformance/cleanup-stack.mjs';
import { CaptureWriter } from '../../src/conformance/capture-writer.mjs';
import { createResourceName, createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { PubSubApi } from '../../src/services/pubsub/google-api.mjs';

const schemaDefinition = JSON.stringify({
  type: 'record',
  name: 'GlobalStackEvent',
  fields: [
    { name: 'run_id', type: 'string' },
    { name: 'count', type: 'int' },
  ],
});

function parseArgs(argv) {
  const args = {
    apply: false,
    projectId: undefined,
    location: undefined,
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg.startsWith('--project=')) {
      args.projectId = arg.slice('--project='.length);
      continue;
    }
    if (arg.startsWith('--location=')) {
      args.location = arg.slice('--location='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = await createRunContext({
    service: 'pubsub-schema',
    projectId: args.projectId,
    location: args.location,
  });
  const schemaId = createResourceName({
    prefix: 'gst-capture-schema',
    runId: context.run_id,
    maxLength: 255,
  });
  const topicName = createResourceName({
    prefix: 'gst-capture-schema-topic',
    runId: context.run_id,
    maxLength: 255,
  });
  const writer = new CaptureWriter({
    service: 'pubsub',
    runId: context.run_id,
  });
  const plan = {
    apply: args.apply,
    project_id: context.project_id,
    location: context.location,
    schema_id: schemaId,
    topic_name: topicName,
    labels: context.labels,
  };

  if (!args.apply) {
    console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
    return;
  }

  const cleanup = new CleanupStack();
  const pubsub = new PubSubApi(new GoogleRestClient());
  let status = 'passed';
  let cleanupResults = [];
  let capturePath = null;

  try {
    await recordExpected(pubsub.validateSchema({
      projectId: context.project_id,
      type: 'AVRO',
      definition: schemaDefinition,
    }), writer, 'validate-schema-definition', 200);

    const createSchema = await recordExpected(pubsub.createSchema({
      projectId: context.project_id,
      schemaId,
      type: 'AVRO',
      definition: schemaDefinition,
    }), writer, 'create-schema', 200);

    cleanup.push(`delete schema ${schemaId}`, async () => {
      await deleteSchemaIfPresent(pubsub, {
        projectId: context.project_id,
        schemaId,
      });
    });

    const schemaName = createSchema.response.body.name;
    await recordExpected(pubsub.getSchema({
      projectId: context.project_id,
      schemaId,
    }), writer, 'get-schema', 200);

    await recordExpected(pubsub.validateMessage({
      projectId: context.project_id,
      schemaName,
      message: {
        run_id: context.run_id,
        count: 1,
      },
    }), writer, 'validate-valid-message', 200);

    await recordExpected(pubsub.validateMessage({
      projectId: context.project_id,
      schemaName,
      message: {
        run_id: context.run_id,
        count: 'not-an-int',
      },
    }), writer, 'validate-invalid-message', 400);

    const createTopic = await recordExpected(pubsub.createTopic({
      projectId: context.project_id,
      topicName,
      labels: context.labels,
      body: {
        schemaSettings: {
          schema: schemaName,
          encoding: 'JSON',
        },
      },
    }), writer, 'create-topic-with-schema-settings', 200);

    cleanup.push(`delete topic ${topicName}`, async () => {
      await deleteTopicIfPresent(pubsub, {
        projectId: context.project_id,
        topicName,
      });
    });

    if (!createTopic.response.ok) {
      throw new Error('Unable to create schema-backed Pub/Sub topic');
    }

    await recordExpected(pubsub.publish({
      projectId: context.project_id,
      topicName,
      messages: [{
        data: {
          run_id: context.run_id,
          count: 1,
        },
        attributes: {
          run_id: context.run_id,
        },
      }],
    }), writer, 'publish-valid-schema-message', 200);

    await recordExpected(pubsub.publish({
      projectId: context.project_id,
      topicName,
      messages: [{
        data: {
          run_id: context.run_id,
          count: 'not-an-int',
        },
        attributes: {
          run_id: context.run_id,
        },
      }],
    }), writer, 'publish-invalid-schema-message', 400);
  } catch (error) {
    status = 'failed';
    writer.recordNote('capture-error', {
      error: {
        name: error.name,
        message: error.message,
      },
    });
    process.exitCode = 1;
  } finally {
    cleanupResults = await cleanup.run();
    const verifyTopicDeleted = await pubsub.getTopic({
      projectId: context.project_id,
      topicName,
    }).catch(errorExchange);
    writer.record('get-topic-after-cleanup', verifyTopicDeleted, {
      expected_status: 404,
    });
    if (verifyTopicDeleted.response.status !== 404) {
      status = 'failed';
      process.exitCode = 1;
    }
    const verifySchemaDeleted = await pubsub.getSchema({
      projectId: context.project_id,
      schemaId,
    }).catch(errorExchange);
    writer.record('get-schema-after-cleanup', verifySchemaDeleted, {
      expected_status: 404,
    });
    if (verifySchemaDeleted.response.status !== 404) {
      status = 'failed';
      process.exitCode = 1;
    }
    if (cleanupResults.some(result => result.status === 'failed')) {
      status = 'failed';
      process.exitCode = 1;
    }
    capturePath = await writer.write({
      context: {
        ...context,
        scenario: 'schema',
        resources: {
          schema_id: schemaId,
          topic_name: topicName,
          schema_definition: schemaDefinition,
        },
      },
      cleanup: cleanupResults,
      status,
    });
  }

  console.log(JSON.stringify({
    status,
    capture_path: capturePath,
    cleanup: cleanupResults,
  }, null, 2));
}

async function recordExpected(exchangePromise, writer, name, expectedStatus) {
  const exchange = await exchangePromise;
  writer.record(name, exchange, { expected_status: expectedStatus });
  requireStatus(exchange, [expectedStatus]);
  return exchange;
}

function requireStatus(exchange, statuses) {
  if (!statuses.includes(exchange.response.status)) {
    throw new Error(`${exchange.request.method} ${exchange.request.url} returned ${exchange.response.status}; expected ${statuses.join(', ')}`);
  }
}

async function deleteTopicIfPresent(pubsub, { projectId, topicName }) {
  const get = await pubsub.getTopic({ projectId, topicName });
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const deleted = await pubsub.deleteTopic({ projectId, topicName });
  requireStatus(deleted, [200, 204]);
}

async function deleteSchemaIfPresent(pubsub, { projectId, schemaId }) {
  const get = await pubsub.getSchema({ projectId, schemaId });
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const deleted = await pubsub.deleteSchema({ projectId, schemaId });
  requireStatus(deleted, [200, 204]);
}

function errorExchange(error) {
  return {
    request: null,
    response: {
      ok: false,
      status: 0,
      status_text: error.name,
      headers: {},
      body: {
        message: error.message,
      },
      ended_at: new Date().toISOString(),
    },
  };
}

await main();
