# Document deployment modules

These modules cover document storage and event routing. A successful Bicep build or ARM deployment does not show that an uploaded document completed processing.

`document-data.bicep` creates the document account and four private containers. It enables Blob versioning and a seven-day soft-delete window. The account name, location, and run identifier come from the experiment manifest. The account is distinct from the Functions host-storage account in `worker-host.bicep`. Scoped Blob Data Contributor assignments allow the pilot identity to upload test files and the worker identity to read and write document blobs. Each assignment uses a run-specific name and description so cleanup can verify ownership.

`document-events.bicep` uses the existing document account and running Functions app. It creates a Storage system topic and a BlobCreated/BlobDeleted subscription for the landing container. The destination is the `documentUploaded` Function discovered from the published app. Event Grid uses its system-assigned identity and a scoped Storage Blob Data Contributor assignment for the dead-letter container. The same compiled template has deployed successfully on Azure and GlobalStack. Runtime delivery and dead-letter behavior still require paired validation.

`document-diagnostic.bicep` is a separate component probe. It adds an owned
`event-diagnostics` container and a second BlobCreated subscription targeting
`documentEventDiagnostic`. The production subscription remains in place. Keeping
the diagnostic in its own module preserves the hashes of the already captured
document data and event templates. The diagnostic module passed a paired native
worker run on Azure and GlobalStack. Both targets wrote and read the marker;
the production handler still failed before the full document workflow.

`document-search.bicep` and `document-failures.bicep` add a Basic Search service and a Standard Service Bus failure queue with local-key authentication disabled. The Search module assigns schema administration to the pilot publisher, document writes to the worker identity and reads to the ingress identity. The queue module assigns send and receive rights to the worker identity. Both modules compile and deploy through the local ARM runtime in a synthetic test. They have not been deployed to Azure. Their public endpoints are a bounded pilot configuration; the private-network requirements in the scenario specification remain unmet.

The local test uses reviewed compiled ARM fixtures in `compiled/` so CI does not depend on a private Bicep image. Source and fixture hashes are pinned in the test. Recompile and review both artifacts together whenever either Bicep module changes.

The push-index field definition in `document-app/search-schema.mjs` matches the committed outbox payload. The local Search query evaluator now applies the application's tenant, clean-state, owner and group filter before returning hits. This is a local functional check, not a paired Azure result. Search index creation, the separate Blob projection indexer, native Service Bus messaging, PostgreSQL, ingress deployment, private network wiring and full workflow remain outstanding.

`document-postgres.bicep` is a validation-only candidate for an Entra-only Flexible Server, its administrator and the `documents` database. It follows the [server](https://learn.microsoft.com/en-us/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers), [administrator](https://learn.microsoft.com/en-us/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers/administrators) and [database](https://learn.microsoft.com/en-us/azure/templates/microsoft.dbforpostgresql/2024-08-01/flexibleservers/databases) resource definitions. The public network setting is provisional; it does not meet the scenario's private-network requirement. The [captured provider validation](../evidence/document-postgres-validation-3ee3c25/) returned HTTP 200 on Azure and HTTP 501 on GlobalStack before the bounded local validator fix. It created no Azure resources. It does not deploy a server, initialize SQL or prove worker database access.

Deploy the data module before the worker app so its Blob endpoint is available in the worker's initial settings. Deploy the event subscription only after the Functions host reports the Event Grid trigger. Compile one immutable revision and run Azure first, then replay it unchanged locally. Record any provider errors and clean up each run. Do not add the new services to a paid run until the ownership-checked cleanup and watchdog cover their resource IDs and deployments.

`worker-scanner-paired.mjs` extends the worker/scanner component run with the document and diagnostic modules. It reserves a USD 12 experiment envelope, starts a detached ownership-checked cleanup watchdog, deploys to Azure first, then replays each template locally. It records a failed stage as a failed stage, including an Azure/GlobalStack mismatch. All owned document resources and deployments must be absent before the budget reservation can be marked cleanup-verified. The opt-in upload and event diagnostics test a managed-identity Blob write and a correlated event marker, but do not substitute for document ingestion and search.

For long runs, invoke `paired-detached.mjs` with the same environment as the runner. It starts the runner in a separate process group and writes `launch.json` and `launcher.log` in the private run directory. Poll the run's `result.json` and watchdog result; a launch record alone is not a completed test. Reconcile any interrupted budget allocation only after a fresh Azure inventory and deployment absence check.

If both the runner and watchdog stop, use `document-paired-recover.mjs` with the
absolute private `private-cleanup.json` path and a new private result path. The
recovery command refuses a live runner, verifies ownership, finishes any
remaining cleanup, independently checks that Azure has zero resources and
deployment records in the preserved pilot group, then marks the allocation
cleanup-verified. It does not recover local container state or measured Azure
billing; verify those separately. The certificate-backed Azure CLI session must
be available through `PAIRED_AZURE_CERTIFICATE_FILE`.

The Event Grid identity and dead-letter role follow [Microsoft's managed-identity guidance](https://learn.microsoft.com/en-us/azure/event-grid/managed-service-identity). The subscription shape follows the [system-topic Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.eventgrid/systemtopics/eventsubscriptions).
