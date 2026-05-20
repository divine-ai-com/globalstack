A regulated document-ingestion team needs Azure infrastructure for a retrieval pipeline that stages source documents, records ingestion work, and emits review events. The task should provision only the storage and messaging surfaces required for document intake and operational control, with application logic and model-serving systems treated as external follow-on integrations.

I want this written in Azure Bicep.

Build an Azure deployment in eastus. It must create one resource group, one StorageV2 storage account, one private blob container named knowledge-documents, one queue named knowledge-jobs, one Azure Files share named knowledgefiles with a 32 GiB quota, one table named knowledgeledger, one Service Bus Standard namespace with a topic named knowledge-events, one Event Grid topic, one Event Hubs Standard namespace with one event hub named knowledge-stream, and one App Configuration store using the free SKU.

Use these exact resource names:
- Resource group: rg-az-regula-bicep-azurebic0520
- Storage account: azregulabicepazurebic0
- Service Bus namespace: sb-regula-bicep-azurebic0520
- Event Grid topic: eg-regula-bicep-azurebic0520
- Event Hubs namespace: eh-regula-bicep-azurebic0520
- App Configuration store: cfgregulabicepazurebic0

Use this exact Azure resource contract:
- Storage account API version 2023-01-01 with kind StorageV2, sku Standard_LRS, and only these properties: allowBlobPublicAccess=false, minimumTlsVersion=TLS1_2, supportsHttpsTrafficOnly=true.
- For Storage child resources, model blobServices/default, queueServices/default, fileServices/default, and tableServices/default as explicit parent resources. Then create the container, queue, share, and table as children whose name is only the target resource name. Do not encode default/ into the child resource name string.
- Blob container API version 2023-01-01 with publicAccess None.
- Queue API version 2023-01-01 with an empty properties object.
- File share API version 2023-01-01 with shareQuota 32.
- Table API version 2023-01-01 with an empty properties object.
- Service Bus namespace API version 2021-11-01 with sku Standard and an empty properties object.
- Service Bus topic API version 2021-11-01 with properties.maxSizeInMegabytes = 1024.
- Event Grid topic API version 2022-06-15 with properties.inputSchema = EventGridSchema.
- Event Hubs namespace API version 2024-01-01 with sku Standard capacity 1 and an empty properties object.
- Event Hub API version 2024-01-01 with partitionCount = 2 and messageRetentionInDays = 1.
- App Configuration store API version 2023-03-01 with sku name free and properties.disableLocalAuth = false.
- Do not add extra properties such as publicNetworkAccess, defaultToOAuthAuthentication, enablePurgeProtection, softDeleteRetentionInDays, status, or unsupported preview-only fields unless they are explicitly required above.

Every resource name that can vary by environment must include the deployment suffix azurebic0520.

Use Azure Bicep with a subscription-scoped lib/main.bicep that creates the resource group and calls a resource-group-scoped lib/workload.bicep module. Keep parameters in lib/parameters.json. Expose exactly the requested output keys as Bicep outputs. Do not embed raw ARM JSON strings inside Bicep resources.

Return exactly these files as Markdown fenced code blocks with a path attribute: lib/main.bicep, lib/workload.bicep, lib/parameters.json.
Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys: `KnowledgeStorageAccountName`, `KnowledgeDocumentsContainerName`, `KnowledgeJobsQueueName`, `KnowledgeFilesShareName`, `KnowledgeLedgerTableName`, `KnowledgeEventsTopicName`, `KnowledgeStreamHubName`, `KnowledgeConfigStoreName`.
