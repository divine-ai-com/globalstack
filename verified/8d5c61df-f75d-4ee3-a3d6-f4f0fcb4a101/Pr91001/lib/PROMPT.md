Feature batches arrive from training and online inference systems throughout the day. The platform team needs a small Azure landing zone where raw feature packages can be uploaded, ingestion work can be queued, fan-out events can be published, and a compact operational ledger can be queried during investigations. The deployment should stay narrowly focused on the storage and messaging foundation for the feature intake path.

I want this written in Terraform Azure HCL.

Build an Azure deployment in eastus. It must create one resource group, one StorageV2 storage account, one private blob container named feature-artifacts, one queue named feature-jobs, one Azure Files share named featurefiles with a 32 GiB quota, one table named featureledger, one Service Bus Standard namespace with a topic named feature-events, one Event Grid topic, one Event Hubs Standard namespace with one event hub named feature-stream, and one App Configuration store using the free SKU.

Use these exact resource names:
- Resource group: rg-az-mlopsf-terraf-azureter0520
- Storage account: azmlopsfterrafazureter
- Service Bus namespace: sb-mlopsf-terraf-azureter0520
- Event Grid topic: eg-mlopsf-terraf-azureter0520
- Event Hubs namespace: eh-mlopsf-terraf-azureter0520
- App Configuration store: cfgmlopsfterrafazureter

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

Every resource name that can vary by environment must include the deployment suffix azureter0520.

Use Terraform HCL with only the Azure AzAPI provider v2.x. Do not use the azurerm provider. Configure provider "azapi" with use_cli = true and a data "azapi_client_config" "current" block. Use azapi_resource for the resource group and every workload resource. Use native HCL object bodies, not jsonencode strings. Create explicit azapi_resource parents for blobServices/default, queueServices/default, fileServices/default, and tableServices/default, then attach the container, queue, share, and table by setting parent_id to those explicit service resources. Do not append /blobServices/default, /queueServices/default, /fileServices/default, or /tableServices/default onto the storage account id in a string expression. Keep each task-owned resource in lib/main.tf and only outputs in lib/outputs.tf.

Return exactly these files as Markdown fenced code blocks with a path attribute: lib/provider.tf, lib/variables.tf, lib/main.tf, lib/outputs.tf.
Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys: `FeatureLakeStorageAccountName`, `FeatureArtifactsContainerName`, `FeatureJobsQueueName`, `FeatureFilesShareName`, `FeatureLedgerTableName`, `FeatureEventsTopicName`, `FeatureStreamHubName`, `FeatureConfigStoreName`.
