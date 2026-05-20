A robotics operations team needs a resilient Azure control-plane slice for field telemetry intake. Robot agents upload diagnostics packages, queue processing jobs, publish fleet events, and stream live telemetry into a bounded hub before downstream digital-twin systems consume it. Keep the task limited to the Azure storage and messaging assets required for this intake layer.

I want this written in Pulumi Azure TypeScript.

Build an Azure deployment in eastus. It must create one resource group, one StorageV2 storage account, one private blob container named robot-artifacts, one queue named robot-jobs, one Azure Files share named robotfiles with a 32 GiB quota, one table named robotledger, one Service Bus Standard namespace with a topic named robot-events, one Event Grid topic, one Event Hubs Standard namespace with one event hub named robot-stream, and one App Configuration store using the free SKU.

Use these exact resource names:
- Resource group: rg-az-roboti-pulumi-azurepul0520
- Storage account: azrobotipulumiazurepul
- Service Bus namespace: sb-roboti-pulumi-azurepul0520
- Event Grid topic: eg-roboti-pulumi-azurepul0520
- Event Hubs namespace: eh-roboti-pulumi-azurepul0520
- App Configuration store: cfgrobotipulumiazurepul

Use this exact Azure resource contract:
- Use the package root imports: @pulumi/azure-native/resources, storage, servicebus, eventgrid, eventhub, and appconfiguration. Do not import a nonexistent versioned namespace path.
- Storage account ARM contract is API version 2023-01-01 with kind StorageV2, sku Standard_LRS, and only these properties: allowBlobPublicAccess=false, minimumTlsVersion=TLS1_2, supportsHttpsTrafficOnly=true. In Pulumi Azure Native, map that ARM property by setting enableHttpsTrafficOnly=true on the StorageAccount resource.
- For Pulumi storage child resources, create BlobContainer, Queue, FileShare, and Table directly with accountName + resourceGroupName + containerName/queueName/shareName/tableName. Do not introduce blobServices/default, queueServices/default, fileServices/default, or tableServices/default helper resources in this platform.
- Blob container API version 2023-01-01 with publicAccess None.
- Queue API version 2023-01-01 with no extra properties.
- File share API version 2023-01-01 with shareQuota 32.
- Table API version 2023-01-01 with no extra properties.
- Service Bus namespace API version 2021-11-01 with sku name Standard and tier Standard.
- Service Bus topic API version 2021-11-01 with maxSizeInMegabytes = 1024.
- Event Grid topic API version 2022-06-15 with inputSchema = EventGridSchema.
- Event Hubs namespace API version 2024-01-01 with sku name Standard, tier Standard, capacity 1.
- Event Hub API version 2024-01-01 with partitionCount = 2 and messageRetentionInDays = 1.
- App Configuration store API version 2023-03-01 with sku name free and disableLocalAuth = false.
- Do not add extra properties such as publicNetworkAccess, defaultToOAuthAuthentication, enablePurgeProtection, softDeleteRetentionInDays, status, or unsupported preview-only fields unless they are explicitly required above.

Every resource name that can vary by environment must include the deployment suffix azurepul0520.

Use Pulumi TypeScript with @pulumi/azure-native. Set Pulumi.yaml main to bin/tap.ts. Put the entry point in bin/tap.ts and the reusable stack construction in lib/tap-stack.ts. Name the stack factory function createTapStack and import that exact symbol from bin/tap.ts. Use a conservative package.json dependency set that is known to resolve in the runner: "@pulumi/azure-native": "^2.80.0", "@pulumi/pulumi": "^3.122.0", "@types/node": "^20.0.0", "ts-node": "^10.9.2", "typescript": "^5.0.0". Export exactly the requested output keys from the Pulumi program. Derive returned outputs from deployed resource outputs rather than hardcoded literal wrappers when the resource output is available. Do not use random suffix generators; use the exact resource names provided.

Return exactly these files as Markdown fenced code blocks with a path attribute: Pulumi.yaml, package.json, bin/tap.ts, lib/tap-stack.ts.
Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys: `RobotTelemetryStorageAccountName`, `RobotArtifactsContainerName`, `RobotJobsQueueName`, `RobotFilesShareName`, `RobotLedgerTableName`, `RobotEventsTopicName`, `RobotTelemetryHubName`, `RobotFleetConfigStoreName`.
