import assert from 'node:assert/strict';
import { runLocalRestGate, expectStatus } from './lib/local-rest-gate.mjs';
import { LoggingApi } from '../../src/services/logging/google-api.mjs';

await runLocalRestGate({
  gate: 'rest-logging',
  service: 'logging',
  execute: async ({ client, endpoint, runId, step }) => {
    const projectId = 'globalstack-local';
    const logName = `projects/${projectId}/logs/globalstack-app`;
    const otherLogName = `projects/${projectId}/logs/other`;
    const logging = new LoggingApi(client, {
      loggingRoot: `${endpoint}/v2`,
    });

    await step('write structured entries', () => logging.writeEntries({
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
    }), expectStatus(200));

    await step('list all project entries', () => logging.listEntries({
      resourceNames: [`projects/${projectId}`],
    }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(exchange.response.body.entries.length, 3);
    });
    await step('filter entries by log name', () => logging.listEntries({
      resourceNames: [`projects/${projectId}`],
      filter: `logName="${logName}"`,
    }), exchange => {
      expectStatus(200)(exchange);
      assert.deepEqual(exchange.response.body.entries.map(entry => entry.jsonPayload.step).sort(), ['accepted', 'failed']);
    });
    await step('filter entries by log name and severity', () => logging.listEntries({
      resourceNames: [`projects/${projectId}`],
      filter: `logName="${logName}" severity="ERROR"`,
    }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(exchange.response.body.entries.length, 1);
      assert.equal(exchange.response.body.entries[0].jsonPayload.step, 'failed');
      assert.equal(exchange.response.body.entries[0].labels.run_id, runId);
    });

    return {
      project_id: projectId,
      log_names: [logName, otherLogName],
      entries_verified: 3,
      filters_verified: ['resourceNames', 'logName', 'severity'],
    };
  },
});
