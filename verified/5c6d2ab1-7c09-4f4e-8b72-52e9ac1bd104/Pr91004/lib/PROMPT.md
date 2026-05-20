A computer-vision inspection platform is struggling with operational latency. Factory cameras upload image batches all day, backend metadata ends up in a transactional store, downstream systems need an event stream for new inspections, and external integrators need one stable API surface instead of direct app endpoints.

I want this written in Pulumi Azure TypeScript.

Build an Azure deployment in eastus for this flow:
- image artifacts land in Blob Storage
- a Function App hosts the backend intake API
- inspection metadata is persisted in Azure Database for PostgreSQL Flexible Server
- inspection domain events are published through an Event Grid topic
- API Management exposes the external intake API and routes it to the Function App backend
- Log Analytics provides the monitoring workspace for this slice

Use these exact resource names:
- Resource group: rg-az-cvflow-pulumi-azurefl0520
- Storage account: azcvflowpulazurefl
- App Service plan: asp-cvflow-pulumi-azurefl0520
- Function App: func-cvflow-pulumi-azurefl0520
- PostgreSQL server: pg-cvflow-pulumi-azurefl0520
- PostgreSQL database: inspectionmeta
- Event Grid topic: eg-cvflow-pulumi-azurefl0520
- API Management service: apim-cvflow-pulumi-azurefl0520
- API Management API id: inspection-intake
- Log Analytics workspace: ws-cvflow-pulumi-azurefl0520

Use this exact Azure resource contract:
- Use the package root imports: @pulumi/azure-native/resources, storage, web, dbforpostgresql, eventgrid, apimanagement, and operationalinsights. Do not import nonexistent versioned namespace paths.
- Storage account ARM contract is API version 2023-01-01 with kind StorageV2, sku Standard_LRS, and only these properties: allowBlobPublicAccess=false, minimumTlsVersion=TLS1_2, supportsHttpsTrafficOnly=true. In Pulumi Azure Native, map that ARM property by setting enableHttpsTrafficOnly=true on the StorageAccount resource.
- Create one private blob container named inspection-artifacts directly with storage.BlobContainer using accountName + resourceGroupName + containerName. Do not introduce blobServices/default helper resources in this platform.
- App Service plan ARM contract is Microsoft.Web/serverfarms API version 2023-12-01 with kind functionapp, sku name Y1, sku tier Dynamic, and reserved=false.
- Function App ARM contract is Microsoft.Web/sites API version 2023-12-01 with kind functionapp, httpsOnly=true, and properties.serverFarmId referencing the plan. Include app settings for FUNCTIONS_WORKER_RUNTIME=node and FUNCTIONS_EXTENSION_VERSION=~4.
- PostgreSQL flexible server ARM contract is Microsoft.DBforPostgreSQL/flexibleServers API version 2023-06-01-preview with administratorLogin=pgadminuser, administratorLoginPassword=InspectionAdmin1!, version=16, sku name Standard_B1ms, sku tier Burstable, storageSizeGB=32, backupRetentionDays=7, and geoRedundantBackup Disabled.
- PostgreSQL database ARM contract is Microsoft.DBforPostgreSQL/flexibleServers/databases API version 2023-06-01-preview with charset UTF8 and collation en_US.utf8.
- Event Grid topic ARM contract is API version 2022-06-15 with inputSchema = EventGridSchema.
- API Management service ARM contract is Microsoft.ApiManagement/service API version 2023-05-01-preview with sku Developer capacity 1, publisherEmail platform@example.com, and publisherName Vision Inspection Platform.
- API Management API ARM contract is Microsoft.ApiManagement/service/apis API version 2023-05-01-preview with displayName inspection-intake, path inspection-intake, protocols [https], subscriptionRequired=false, and serviceUrl derived from the deployed Function App hostname as https://<function-host>/api/inspection-intake.
- Log Analytics workspace ARM contract is Microsoft.OperationalInsights/workspaces API version 2022-10-01 with sku PerGB2018, retentionInDays 30, publicNetworkAccessForIngestion Enabled, and publicNetworkAccessForQuery Enabled.
- Do not add unsupported or out-of-scope properties such as public network settings on resources not explicitly scoped above, private endpoints, Event Grid event subscriptions, or preview-only fields that are not required by the contract above.

Every resource name that can vary by environment must include the deployment suffix azurefl0520.

Use Pulumi TypeScript with @pulumi/azure-native. Set Pulumi.yaml main to bin/tap.ts. Put the entry point in bin/tap.ts and the reusable stack construction in lib/tap-stack.ts. Name the stack factory function createTapStack and import that exact symbol from bin/tap.ts. Use this conservative package.json dependency set: "@pulumi/azure-native": "^2.80.0", "@pulumi/pulumi": "^3.122.0", "@types/node": "^20.0.0", "ts-node": "^10.9.2", "typescript": "^5.0.0". Export every created resource with a stable semantic output key, including the Function App hostname and API Management gateway URL. Derive returned outputs from deployed resource outputs rather than hardcoded literal wrappers when the resource output is available. Do not use random suffix generators; use the exact resource names provided.

Return exactly these files as Markdown fenced code blocks with a path attribute: Pulumi.yaml, package.json, bin/tap.ts, lib/tap-stack.ts.
Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys: `InspectionArtifactsStorageAccountName`, `InspectionArtifactsContainerName`, `InspectionBackendPlanName`, `InspectionFunctionAppName`, `InspectionBackendHostName`, `InspectionMetadataPostgresServerName`, `InspectionMetadataPostgresDatabaseName`, `InspectionEventTopicName`, `InspectionGatewayServiceName`, `InspectionGatewayApiName`, `InspectionGatewayUrl`, `InspectionMonitoringWorkspaceName`.
