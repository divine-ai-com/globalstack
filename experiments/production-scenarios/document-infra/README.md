# Document deployment modules

These modules are under construction. A successful Bicep build does not show that Azure or GlobalStack accepted or executed the deployment.

`document-data.bicep` creates the document account and four private containers. It enables Blob versioning and a seven-day soft-delete window. The account name, location, and run identifier come from the experiment manifest. The account is distinct from the Functions host-storage account in `worker-host.bicep`.

`document-events.bicep` uses the existing document account and running Functions app. It creates a Storage system topic and a BlobCreated/BlobDeleted subscription for the landing container. The destination is the `documentUploaded` Function discovered from the published app. Event Grid uses its system-assigned identity and a scoped Storage Blob Data Contributor assignment for the dead-letter container. The template deliberately includes the required dead-letter destination. GlobalStack currently rejects this property, so a local deployment failure must be retained as a product gap until the behavior is implemented and paired with Azure.

Deploy the data module before supplying the worker's application settings. Deploy the event subscription only after the Functions host reports the Event Grid trigger. Compile one immutable revision and run Azure first, then replay it unchanged locally. Record any provider errors and clean up each run. These modules do not yet include PostgreSQL, Search, Service Bus, ingress, private network wiring, or the full document workflow.

The Event Grid identity and dead-letter role follow [Microsoft's managed-identity guidance](https://learn.microsoft.com/en-us/azure/event-grid/managed-service-identity). The subscription shape follows the [system-topic Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.eventgrid/systemtopics/eventsubscriptions).
