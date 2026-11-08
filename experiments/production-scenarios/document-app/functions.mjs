import { app } from '@azure/functions';
import df from 'durable-functions';
import { documentEvent } from './events.mjs';
import { applicationConfig, clients, drainOutbox, recordFailure, scanAndStore, settleFailures } from './adapters.mjs';
import { processingContext } from './repository.mjs';
import { createScannerDiagnostic } from './scanner-diagnostic.mjs';
import { createUploadDiagnostic } from './upload-diagnostic.mjs';
import { createEventDiagnostic } from './event-diagnostic.mjs';

if (process.env.SCANNER_DIAGNOSTIC_ENABLED === 'true') {
  app.http('scannerDiagnostic', { route: 'scanner-diagnostic', methods: ['POST'], authLevel: 'admin', handler: createScannerDiagnostic() });
}
if (process.env.DOCUMENT_UPLOAD_DIAGNOSTIC_ENABLED === 'true') {
  app.http('uploadDiagnostic', { route: 'upload-diagnostic', methods: ['POST'], authLevel: 'admin', handler: createUploadDiagnostic() });
}
if (process.env.DOCUMENT_EVENT_DIAGNOSTIC_ENABLED === 'true') {
  const diagnostic = createEventDiagnostic();
  app.eventGrid('documentEventDiagnostic', { handler: diagnostic.onEvent });
  app.http('documentEventDiagnosticStatus', { route: 'event-diagnostic-status', methods: ['POST'], authLevel: 'admin', handler: diagnostic.status });
}

app.http('workerHealth', { route: 'health', methods: ['GET'], authLevel: 'anonymous',
  handler: () => ({ jsonBody: { worker: 'ready' } }),
});

app.eventGrid('documentUploaded', {
  extraInputs: [df.input.durableClient()],
  handler: async (event, context) => {
    const parsed = documentEvent(event, applicationConfig());
    if (!parsed) { context.log(JSON.stringify({ stage: 'event_ignored' })); return; }
    const { pool } = await clients();
    const input = await processingContext(pool, parsed);
    const client = df.getClient(context);
    const existing = await client.getStatus(input.correlationId);
    if (existing) {
      context.log(JSON.stringify({ stage: 'event_duplicate', correlationId: input.rootCorrelationId, processingId: input.correlationId, runtimeStatus: existing.runtimeStatus }));
      return;
    }
    await client.startNew('documentWorkflow', { instanceId: input.correlationId, input });
    context.log(JSON.stringify({ stage: 'orchestration_started', correlationId: input.rootCorrelationId, processingId: input.correlationId }));
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
