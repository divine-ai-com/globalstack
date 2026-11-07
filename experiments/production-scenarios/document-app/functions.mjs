import { app } from '@azure/functions';
import df from 'durable-functions';
import { documentEvent } from './events.mjs';
import { applicationConfig, drainOutbox, recordFailure, scanAndStore, settleFailures } from './adapters.mjs';

app.http('workerHealth', { route: 'health', methods: ['GET'], authLevel: 'anonymous',
  handler: () => ({ jsonBody: { worker: 'ready' } }),
});

app.eventGrid('documentUploaded', {
  extraInputs: [df.input.durableClient()],
  handler: async (event, context) => {
    const input = documentEvent(event, applicationConfig());
    if (!input) { context.log(JSON.stringify({ stage: 'event_ignored' })); return; }
    const client = df.getClient(context);
    const existing = await client.getStatus(input.correlationId);
    if (existing) {
      context.log(JSON.stringify({ stage: 'event_duplicate', correlationId: input.correlationId, runtimeStatus: existing.runtimeStatus }));
      return;
    }
    await client.startNew('documentWorkflow', { instanceId: input.correlationId, input });
    context.log(JSON.stringify({ stage: 'orchestration_started', correlationId: input.correlationId }));
  },
});

df.app.orchestration('documentWorkflow', function* (context) {
  const input = context.df.getInput();
  const retry = new df.RetryOptions(2000, 3);
  try {
    const result = yield context.df.callActivityWithRetry('scanAndStore', retry, input);
    yield context.df.callActivityWithRetry('deliverIndexChanges', retry, null);
    return result;
  } catch (error) {
    yield context.df.callActivityWithRetry('recordProcessingFailure', retry, input);
    throw error;
  }
});

df.app.activity('scanAndStore', { handler: scanAndStore });
df.app.activity('deliverIndexChanges', { handler: (_input, context) => drainOutbox(context) });
df.app.activity('recordProcessingFailure', { handler: recordFailure });
app.timer('retryIndexChanges', { schedule: '*/15 * * * * *', handler: (_timer, context) => drainOutbox(context) });
app.timer('settleDocumentFailures', { schedule: '*/15 * * * * *', handler: (_timer, context) => settleFailures(context) });
