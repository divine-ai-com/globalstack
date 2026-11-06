A claims operations team needs an Azure intake ring for evidence packets and downstream command fan-out. Adjusters upload evidence archives, queue classification work, publish claim events, and keep a compact ledger that investigators can query without waiting for a larger platform migration. Keep the task narrowly focused on the Azure storage and messaging foundation for this evidence and command path.

I want this written in Terraform Azure HCL.

Build an Azure deployment in eastus. It must create one resource group, one StorageV2 storage account, one private blob container named claims-evidence, one queue named claims-jobs, one Azure Files share named claimsfiles with a 32 GiB quota, one table named claimsledger, one Service Bus Standard namespace with a topic named claims-events, one Event Grid topic, one Event Hubs Standard namespace with one event hub named claims-stream, and one App Configuration store using the free SKU.

Use these exact resource names:
- Resource group: rg-az-claims-terraf-azureter0526
- Storage account: azclaimsterrafazureter
- Service Bus namespace: sb-claims-terraf-azureter0526
- Event Grid topic: eg-claims-terraf-azureter0526
- Event Hubs namespace: eh-claims-terraf-azureter0526
- App Configuration store: cfgclaimsterrafazureter

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

Every resource name that can vary by environment must include the deployment suffix azureter0526.

Use Terraform HCL with only the Azure AzAPI provider v2.x. Do not use the azurerm provider. Configure provider "azapi" with use_cli = true and a data "azapi_client_config" "current" block. Declare string variables named subscription_id, location, resource_group_name, and storage_account_name in lib/variables.tf because the runner passes those exact variables at deploy time. Use var.location for the resource group and storage account location, use var.resource_group_name for the resource group name, and use var.storage_account_name for the storage account name. Use azapi_resource for the resource group and every workload resource. Use native HCL object bodies, not jsonencode strings. Create explicit azapi_resource parents for blobServices/default, queueServices/default, fileServices/default, and tableServices/default, then attach the container, queue, share, and table by setting parent_id to those explicit service resources. Do not append /blobServices/default, /queueServices/default, /fileServices/default, or /tableServices/default onto the storage account id in a string expression. Keep each task-owned resource in lib/main.tf and only outputs in lib/outputs.tf.

Return exactly these files as Markdown fenced code blocks with a path attribute: lib/provider.tf, lib/variables.tf, lib/main.tf, lib/outputs.tf.
Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys: `ClaimsEvidenceStorageAccountName`, `ClaimsEvidenceContainerName`, `ClaimsJobsQueueName`, `ClaimsFilesShareName`, `ClaimsLedgerTableName`, `ClaimsEventsTopicName`, `ClaimsStreamHubName`, `ClaimsConfigStoreName`.

Revision 2 amendment: see ../../CONTRACT.md for the added Event Grid subscription, worker URL variable, extra output, and observable behavior. The earlier exactly-eight-output constraint is superseded by that amendment.
