import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { startFirestoreEmulator } from '../../src/services/firestore/emulator-engine.mjs';
import { decodeFields, FirestoreApi } from '../../src/services/firestore/google-api.mjs';

test('Firestore official emulator runs document create, read, list, update, delete lifecycle', async () => {
  const runId = createRunId('firestore-doc');
  const projectId = 'globalstack-local';
  const collectionId = `gst_${runId.replace(/-/g, '_')}`;
  const documentId = 'workflow-state';
  const emulator = await startFirestoreEmulator();
  const firestore = new FirestoreApi(new GoogleRestClient({
    tokenProvider: async () => null,
  }), {
    firestoreRoot: `http://${emulator.endpoint}/v1`,
  });

  try {
    const create = await firestore.createOrReplaceDocument({
      projectId,
      collectionId,
      documentId,
      fields: {
        run_id: runId,
        status: 'created',
        attempt: 1,
        active: true,
        nested: {
          source: 'official-emulator',
        },
      },
    });
    assert.equal(create.response.status, 200);
    assert.equal(decodeFields(create.response.body.fields).run_id, runId);

    const get = await firestore.getDocument({ projectId, collectionId, documentId });
    assert.equal(get.response.status, 200);
    assert.deepEqual(decodeFields(get.response.body.fields), {
      run_id: runId,
      status: 'created',
      attempt: 1,
      active: true,
      nested: {
        source: 'official-emulator',
      },
    });

    const list = await firestore.listDocuments({ projectId, collectionId });
    assert.equal(list.response.status, 200);
    assert.ok(list.response.body.documents.some(document => document.name.endsWith(`/${collectionId}/${documentId}`)));

    const update = await firestore.createOrReplaceDocument({
      projectId,
      collectionId,
      documentId,
      fields: {
        run_id: runId,
        status: 'updated',
        attempt: 2,
        active: false,
      },
    });
    assert.equal(update.response.status, 200);
    assert.equal(decodeFields(update.response.body.fields).status, 'updated');

    const deleted = await firestore.deleteDocument({ projectId, collectionId, documentId });
    assert.ok([200, 204].includes(deleted.response.status));

    const missing = await firestore.getDocument({ projectId, collectionId, documentId });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.response.body.error.status, 'NOT_FOUND');
  } finally {
    await firestore.deleteDocument({ projectId, collectionId, documentId }).catch(() => {});
    await emulator.stop();
  }
});
