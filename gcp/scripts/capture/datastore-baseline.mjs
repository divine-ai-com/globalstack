import { CleanupStack } from '../../src/conformance/cleanup-stack.mjs';
import { CaptureWriter } from '../../src/conformance/capture-writer.mjs';
import { createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { decodeProperties, DatastoreApi } from '../../src/services/firestore/datastore-api.mjs';

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
    service: 'datastore',
    projectId: args.projectId,
    location: args.location,
  });
  const kind = `GlobalStack${context.run_id.replace(/[^A-Za-z0-9]/g, '')}`;
  const name = 'workflow-state';
  const writer = new CaptureWriter({
    service: 'datastore',
    runId: context.run_id,
  });
  const plan = {
    apply: args.apply,
    project_id: context.project_id,
    location: context.location,
    kind,
    name,
    labels: context.labels,
  };

  if (!args.apply) {
    console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
    return;
  }

  const cleanup = new CleanupStack();
  const datastore = new DatastoreApi(new GoogleRestClient());
  let status = 'passed';
  let cleanupResults = [];
  let capturePath = null;

  try {
    await recordExpected(datastore.lookupEntity({
      projectId: context.project_id,
      kind,
      name,
    }), writer, 'lookup-missing-before-create', 200);

    await recordExpected(datastore.upsertEntity({
      projectId: context.project_id,
      kind,
      name,
      properties: {
        run_id: context.run_id,
        status: 'created',
        attempt: 1,
        active: true,
      },
    }), writer, 'upsert-entity', 200);

    cleanup.push(`delete datastore entity ${kind}/${name}`, async () => {
      await datastore.deleteEntity({
        projectId: context.project_id,
        kind,
        name,
      });
    });

    const lookup = await recordExpected(datastore.lookupEntity({
      projectId: context.project_id,
      kind,
      name,
    }), writer, 'lookup-after-upsert', 200);
    const found = lookup.response.body.found?.[0]?.entity;
    if (!found) throw new Error('Datastore lookup did not return entity after upsert');
    if (decodeProperties(found.properties).run_id !== context.run_id) {
      throw new Error('Datastore entity run_id did not round trip');
    }

    await recordExpected(datastore.runQuery({
      projectId: context.project_id,
      kind,
    }), writer, 'query-by-kind', 200);

    await recordExpected(datastore.upsertEntity({
      projectId: context.project_id,
      kind,
      name,
      properties: {
        run_id: context.run_id,
        status: 'updated',
        attempt: 2,
        active: false,
      },
    }), writer, 'update-entity', 200);

    await recordExpected(datastore.deleteEntity({
      projectId: context.project_id,
      kind,
      name,
    }), writer, 'delete-entity', 200);
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
    const verifyMissing = await datastore.lookupEntity({
      projectId: context.project_id,
      kind,
      name,
    }).catch(errorExchange);
    writer.record('lookup-after-cleanup', verifyMissing, {
      expected_status: 200,
      expected_missing_count: 1,
    });
    if (verifyMissing.response.status !== 200 || !verifyMissing.response.body.missing?.length) {
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
        scenario: 'entity-lifecycle',
        resources: {
          kind,
          name,
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
