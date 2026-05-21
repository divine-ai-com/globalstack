A robotics operations team needs an Azure diagnostics-intake slice that can be exercised end to end immediately after deployment. Field robots upload diagnostics bundles, enqueue processing jobs, persist a ledger entry for each intake, publish fleet notifications, and read/write runtime ingestion settings.

I want this written in Pulumi Azure TypeScript.

Build an Azure deployment in eastus for this flow:
- diagnostics artifacts land in Blob Storage
- intake jobs are queued in Queue Storage
- intake status is recorded in Table Storage
- fleet notifications are published through an Event Grid topic
- runtime ingestion settings are stored in App Configuration

Use these exact resource names:
- Resource group: rg-az-rbflow-pulumi-azurefl0521
- Storage account: azrbflowazurefl0521
- Blob container: diagnostics-batches
- Queue: diagnostics-jobs
- Table: diagnosticsledger
- Event Grid topic: eg-rbflow-pulumi-azurefl0521
- App Configuration store: cfgrbflowazurefl0521

Use this exact Azure resource contract:
- Use the package root imports: @pulumi/azure-native/resources, storage, eventgrid, and appconfiguration. Do not import nonexistent versioned namespace paths.
- Storage account ARM contract is API version 2023-01-01 with kind StorageV2, sku Standard_LRS, and only these properties: allowBlobPublicAccess=false, minimumTlsVersion=TLS1_2, supportsHttpsTrafficOnly=true. In Pulumi Azure Native, map that ARM property by setting enableHttpsTrafficOnly=true on the StorageAccount resource.
- Create one private blob container named diagnostics-batches directly with storage.BlobContainer using accountName + resourceGroupName + containerName. Do not introduce blobServices/default helper resources in this platform.
- Create one queue named diagnostics-jobs directly with storage.Queue using accountName + resourceGroupName + queueName.
- Create one table named diagnosticsledger directly with storage.Table using accountName + resourceGroupName + tableName.
- Event Grid topic ARM contract is API version 2022-06-15 with inputSchema = EventGridSchema.
- App Configuration store ARM contract is Microsoft.AppConfiguration/configurationStores API version 2023-03-01 with sku name free and disableLocalAuth = false.
- Do not add unsupported or out-of-scope properties such as private endpoints, Event Grid event subscriptions, labels on ARM resources, or preview-only fields that are not required by the contract above.

Every resource name that can vary by environment must include the deployment suffix azurefl0521.

Use Pulumi TypeScript with @pulumi/azure-native. Set Pulumi.yaml main to bin/tap.ts. Put the entry point in bin/tap.ts and the reusable stack construction in lib/tap-stack.ts. Name the stack factory function createTapStack and import that exact symbol from bin/tap.ts. Use this conservative package.json dependency set: "@pulumi/azure-native": "^2.80.0", "@pulumi/pulumi": "^3.122.0", "@types/node": "^20.0.0", "ts-node": "^10.9.2", "typescript": "^5.0.0". Export every created resource with a stable semantic output key, including the Function App hostname and API Management gateway URL. Derive returned outputs from deployed resource outputs rather than hardcoded literal wrappers when the resource output is available. Do not use random suffix generators; use the exact resource names provided.
The deployment must be testable immediately after provisioning by:
- uploading one diagnostics manifest blob into the deployed container
- enqueueing one diagnostics job message into the deployed queue
- inserting and reading one diagnostics ledger entity in the deployed table
- writing, locking, unlocking, reading, and deleting one App Configuration key-value
- publishing one valid Event Grid event to the deployed topic and proving one invalid event batch is rejected

Use Pulumi TypeScript with @pulumi/azure-native. Set Pulumi.yaml main to bin/tap.ts. Put the entry point in bin/tap.ts and the reusable stack construction in lib/tap-stack.ts. Name the stack factory function createTapStack and import that exact symbol from bin/tap.ts. Use this conservative package.json dependency set: "@pulumi/azure-native": "^2.80.0", "@pulumi/pulumi": "^3.122.0", "@types/node": "^20.0.0", "ts-node": "^10.9.2", "typescript": "^5.0.0". Export every created resource with a stable semantic output key. Derive returned outputs from deployed resource outputs rather than hardcoded literal wrappers when the resource output is available. Do not use random suffix generators; use the exact resource names provided.

Return exactly these files as Markdown fenced code blocks with a path attribute: Pulumi.yaml, package.json, bin/tap.ts, lib/tap-stack.ts.
Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys: `DiagnosticsStorageAccountName`, `DiagnosticsArtifactsContainerName`, `DiagnosticsJobsQueueName`, `DiagnosticsLedgerTableName`, `FleetEventsTopicName`, `FleetConfigStoreName`.
