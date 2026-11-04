import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { LoggingApi } from '../../src/services/logging/google-api.mjs';
import { runPulumiLocalLifecycle } from './lib/pulumi-local-lifecycle.mjs';

const templateDir = new URL('../../templates/pulumi/logging/', import.meta.url);

await runPulumiLocalLifecycle({
  argv: process.argv.slice(2),
  templateDir,
  runIdPrefix: 'pulumi-logging',
  configure: async ({ runId }) => {
    const runtime = await listen({ port: 0 });
    const projectId = 'globalstack-local';
    const metricId = `gst_${runId.replace(/-/g, '_')}`.slice(0, 100);
    const logName = `projects/${projectId}/logs/globalstack-app`;
    const metricFilter = `logName="${logName}" severity="ERROR"`;
    return {
      runtime,
      projectId,
      metricId,
      metricFilter,
      logName,
      env: {
        GOOGLE_LOGGING_CUSTOM_ENDPOINT: `${runtime.url}/v2/`,
      },
      config: {
        projectId,
        metricId,
        metricFilter,
        loggingEndpoint: `${runtime.url}/v2/`,
      },
      cleanup: () => runtime.close(),
    };
  },
  afterUp: async ({ runtime, projectId, metricFilter, logName, runId }) => {
    const logging = new LoggingApi(new GoogleRestClient({ tokenProvider: async () => null }), {
      loggingRoot: `${runtime.url}/v2`,
    });
    await logging.writeEntries({
      resource: {
        type: 'global',
        labels: { project_id: projectId },
      },
      labels: { run_id: runId },
      entries: [
        {
          logName,
          severity: 'INFO',
          jsonPayload: { run_id: runId, step: 'accepted' },
        },
        {
          logName,
          severity: 'ERROR',
          jsonPayload: { run_id: runId, step: 'failed' },
        },
      ],
    });
    const errors = await logging.listEntries({
      resourceNames: [`projects/${projectId}`],
      filter: metricFilter,
    });
    if (errors.response.body.entries.length !== 1 || errors.response.body.entries[0].jsonPayload.step !== 'failed') {
      throw new Error(`Pulumi Cloud Logging filter check failed for ${runId}`);
    }
  },
  report: ({ context }) => ({
    metric_id: context?.metricId,
    metric_filter: context?.metricFilter,
    endpoint: context?.runtime ? `${context.runtime.url}/v2/` : null,
  }),
});
