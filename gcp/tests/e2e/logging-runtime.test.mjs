import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { LoggingApi } from '../../src/services/logging/google-api.mjs';

test('Cloud Logging local runtime writes and filters structured log entries', async () => {
  const runtime = await listen({ port: 0 });
  const runId = createRunId('logging-runtime');
  const projectId = 'globalstack-local';
  const logName = `projects/${projectId}/logs/globalstack-app`;
  const otherLogName = `projects/${projectId}/logs/other`;
  const metricId = `gst_${runId.replace(/-/g, '_')}`;
  const logging = new LoggingApi(new GoogleRestClient({
    tokenProvider: async () => null,
  }), {
    loggingRoot: `${runtime.url}/v2`,
  });

  try {
    const createMetric = await logging.createMetric({
      projectId,
      metric: {
        name: metricId,
        description: 'GlobalStack conformance workflow error counter',
        filter: `logName="${logName}" severity="ERROR"`,
        metricDescriptor: {
          displayName: 'GlobalStack workflow errors',
          metricKind: 'DELTA',
          valueType: 'INT64',
          unit: '1',
        },
      },
    });
    assert.equal(createMetric.response.status, 200);
    assert.equal(createMetric.response.body.name, metricId);

    const getMetric = await logging.getMetric({ projectId, metricId });
    assert.equal(getMetric.response.status, 200);
    assert.equal(getMetric.response.body.filter, `logName="${logName}" severity="ERROR"`);

    const listMetrics = await logging.listMetrics(projectId);
    assert.equal(listMetrics.response.status, 200);
    assert.ok(listMetrics.response.body.metrics.some(metric => metric.name === metricId));

    const write = await logging.writeEntries({
      resource: {
        type: 'global',
        labels: {
          project_id: projectId,
        },
      },
      labels: {
        run_id: runId,
      },
      entries: [
        {
          logName,
          severity: 'INFO',
          jsonPayload: {
            run_id: runId,
            step: 'accepted',
          },
        },
        {
          logName,
          severity: 'ERROR',
          jsonPayload: {
            run_id: runId,
            step: 'failed',
          },
        },
        {
          logName: otherLogName,
          severity: 'INFO',
          jsonPayload: {
            run_id: runId,
            step: 'other',
          },
        },
      ],
    });
    assert.equal(write.response.status, 200);

    const all = await logging.listEntries({
      resourceNames: [`projects/${projectId}`],
    });
    assert.equal(all.response.status, 200);
    assert.equal(all.response.body.entries.length, 3);

    const byLog = await logging.listEntries({
      resourceNames: [`projects/${projectId}`],
      filter: `logName="${logName}"`,
    });
    assert.equal(byLog.response.status, 200);
    assert.equal(byLog.response.body.entries.length, 2);
    assert.deepEqual(byLog.response.body.entries.map(entry => entry.jsonPayload.step).sort(), ['accepted', 'failed']);

    const errors = await logging.listEntries({
      resourceNames: [`projects/${projectId}`],
      filter: `logName="${logName}" severity="ERROR"`,
    });
    assert.equal(errors.response.status, 200);
    assert.equal(errors.response.body.entries.length, 1);
    assert.equal(errors.response.body.entries[0].jsonPayload.step, 'failed');
    assert.equal(errors.response.body.entries[0].labels.run_id, runId);

    const deleteMetric = await logging.deleteMetric({ projectId, metricId });
    assert.equal(deleteMetric.response.status, 200);
    const missingMetric = await logging.getMetric({ projectId, metricId });
    assert.equal(missingMetric.response.status, 404);
  } finally {
    await runtime.close();
  }
});
