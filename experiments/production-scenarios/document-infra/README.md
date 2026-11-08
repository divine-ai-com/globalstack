# Document deployment modules

These modules cover document storage and event routing. A successful Bicep build or ARM deployment does not show that an uploaded document completed processing.

`document-data.bicep` creates the document account and four private containers. It enables Blob versioning and a seven-day soft-delete window. The account name, location, and run identifier come from the experiment manifest. The account is distinct from the Functions host-storage account in `worker-host.bicep`. Scoped Blob Data Contributor assignments allow the pilot identity to upload test files and the worker identity to read and write document blobs. Each assignment uses a run-specific name and description so cleanup can verify ownership.

`document-events.bicep` uses the existing document account and running Functions app. It creates a Storage system topic and a BlobCreated/BlobDeleted subscription for the landing container. The destination is the `documentUploaded` Function discovered from the published app. Event Grid uses its system-assigned identity and a scoped Storage Blob Data Contributor assignment for the dead-letter container. The same compiled template has deployed successfully on Azure and GlobalStack. Runtime delivery and dead-letter behavior still require paired validation.

`document-diagnostic.bicep` is a separate component probe. It adds an owned
`event-diagnostics` container and a second BlobCreated subscription targeting
`documentEventDiagnostic`. The production subscription remains in place. Keeping
the diagnostic in its own module preserves the hashes of the already captured
document data and event templates. The diagnostic module has passed a local
native-worker run; it has not yet been deployed to Azure.

Deploy the data module before the worker app so its Blob endpoint is available in the worker's initial settings. Deploy the event subscription only after the Functions host reports the Event Grid trigger. Compile one immutable revision and run Azure first, then replay it unchanged locally. Record any provider errors and clean up each run. These modules do not yet include PostgreSQL, Search, Service Bus, ingress, private network wiring, or the full document workflow.

`worker-scanner-paired.mjs` extends the worker/scanner component run with the document and diagnostic modules. It reserves a USD 12 experiment envelope, starts a detached ownership-checked cleanup watchdog, deploys to Azure first, then replays each template locally. It records a failed stage as a failed stage, including an Azure/GlobalStack mismatch. All owned document resources and deployments must be absent before the budget reservation can be marked cleanup-verified. The opt-in upload and event diagnostics test a managed-identity Blob write and a correlated event marker, but do not substitute for document ingestion and search.

For long runs, invoke `paired-detached.mjs` with the same environment as the runner. It starts the runner in a separate process group and writes `launch.json` and `launcher.log` in the private run directory. Poll the run's `result.json` and watchdog result; a launch record alone is not a completed test. Reconcile any interrupted budget allocation only after a fresh Azure inventory and deployment absence check.

The Event Grid identity and dead-letter role follow [Microsoft's managed-identity guidance](https://learn.microsoft.com/en-us/azure/event-grid/managed-service-identity). The subscription shape follows the [system-topic Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.eventgrid/systemtopics/eventsubscriptions).
