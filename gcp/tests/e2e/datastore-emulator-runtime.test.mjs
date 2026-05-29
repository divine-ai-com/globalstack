import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { decodeProperties, DatastoreApi } from '../../src/services/firestore/datastore-api.mjs';
import { startFirestoreEmulator } from '../../src/services/firestore/emulator-engine.mjs';

test('Datastore mode official emulator runs entity upsert, lookup, query, update, delete lifecycle', async () => {
  const runId = createRunId('datastore-entity');
  const projectId = 'globalstack-local';
  const kind = `GlobalStack${runId.replace(/-/g, '')}`;
  const name = 'workflow-state';
  const emulator = await startFirestoreEmulator({ databaseMode: 'datastore-mode' });
  const datastore = new DatastoreApi(new GoogleRestClient({
    tokenProvider: async () => null,
  }), {
    datastoreRoot: `http://${emulator.endpoint}/v1`,
  });

  try {
    const upsert = await datastore.upsertEntity({
      projectId,
      kind,
      name,
      properties: {
        run_id: runId,
        status: 'created',
        attempt: 1,
        active: true,
        nested: {
          source: 'official-emulator',
        },
      },
    });
    assert.equal(upsert.response.status, 200);
    assert.equal(upsert.response.body.mutationResults.length, 1);

    const lookup = await datastore.lookupEntity({ projectId, kind, name });
    assert.equal(lookup.response.status, 200);
    assert.equal(lookup.response.body.found.length, 1);
    assert.deepEqual(decodeProperties(lookup.response.body.found[0].entity.properties), {
      run_id: runId,
      status: 'created',
      attempt: 1,
      active: true,
      nested: {
        source: 'official-emulator',
      },
    });

    const query = await datastore.runQuery({ projectId, kind });
    assert.equal(query.response.status, 200);
    assert.ok((query.response.body.batch.entityResults ?? []).some(result =>
      result.entity.key.path.at(-1).name === name
    ));

    const update = await datastore.upsertEntity({
      projectId,
      kind,
      name,
      properties: {
        run_id: runId,
        status: 'updated',
        attempt: 2,
        active: false,
      },
    });
    assert.equal(update.response.status, 200);
    const updatedLookup = await datastore.lookupEntity({ projectId, kind, name });
    assert.equal(updatedLookup.response.status, 200);
    assert.equal(decodeProperties(updatedLookup.response.body.found[0].entity.properties).status, 'updated');

    const deleted = await datastore.deleteEntity({ projectId, kind, name });
    assert.equal(deleted.response.status, 200);
    const missing = await datastore.lookupEntity({ projectId, kind, name });
    assert.equal(missing.response.status, 200);
    assert.equal(missing.response.body.missing.length, 1);
  } finally {
    await datastore.deleteEntity({ projectId, kind, name }).catch(() => {});
    await emulator.stop();
  }
});
