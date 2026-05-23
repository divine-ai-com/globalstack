import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { distPath, verificationRepoRoot, verifiedWorkspacePath, workspaceRoot } from "../../workspace-utils/src/index.mjs";

const root = workspaceRoot(import.meta.url);
const verifiedRoot = verifiedWorkspacePath(root);
const verificationRoot = verificationRepoRoot(root);
const runtimeRoot = distPath(root, "verified-bundle-runtime");
const model = process.env.OPENAI_MODEL ?? "gpt-5.5";
const location = process.env.AZURE_LOCATION ?? "eastus";

const bundleFilter = process.argv
  .filter((arg) => arg.startsWith("--bundle="))
  .flatMap((arg) => arg.slice("--bundle=".length).split(","))
  .map((item) => item.trim())
  .filter(Boolean);

const runEnabled = !process.argv.includes("--no-run");

const scenarios = [
  {
    poId: "4da789dc-1b39-4704-81f9-21cabd36ea15",
    prId: "Pr91006",
    scenarioId: "supplier-returns-orchestration",
    title: "Supplier returns orchestration",
    prompt: [
      "Our supplier warranty team is trying to get away from email threads and spreadsheets for return authorizations. They need one Azure deployment that gives them a controlled intake surface, a durable orchestration path for approvals, reliable internal fan-out, document storage, a transactional system of record for case state, and normal secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Put Azure API Management in front of the supplier-facing intake API, back that intake path with an Azure Function App, add a Logic App for the long-running approval workflow, use a Service Bus topic with one warehouse subscription and one finance subscription for downstream processing, publish business events through an Event Grid topic, keep return documents in Blob Storage, keep mutable case state in Azure Database for PostgreSQL Flexible Server, store shared configuration in App Configuration, store secrets in Key Vault, and route diagnostics into Log Analytics and Application Insights.",
      "",
      "Use these exact resource names: resource group `rg-az-supplier-returns-pulumi-91006`, storage account `azsupretpul91006`, blob container `supplier-return-docs`, Service Bus namespace `sb-supplier-returns-91006`, Service Bus topic `supplier-returns`, Service Bus subscription `warehouse`, Service Bus subscription `finance`, Event Grid topic `eg-supplier-returns-91006`, Function App plan `plan-supplier-returns-91006`, Function App `func-supplier-returns-91006`, API Management service `apim-supplier-returns-91006`, API Management API `supplier-returns-api`, API Management product `supplier-returns-product`, Logic App workflow `la-supplier-returns-91006`, PostgreSQL flexible server `pg-supplier-returns-91006`, PostgreSQL database `returnsdb`, Key Vault `kv-supplier-ret-91006`, App Configuration store `cfg-supplier-returns-91006`, Log Analytics workspace `log-supplier-returns-91006`, and Application Insights component `appi-supplier-returns-91006`.",
      "",
      "Keep the storage account private and HTTPS-only. API Management is the only public entry point in this task. The Function App and Logic App are both part of the orchestration surface. The Service Bus topic is for internal fan-out only. The PostgreSQL server carries the returns database. Keep this limited to the services above; do not add out-of-scope services such as AKS, Cosmos DB, Front Door, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `SupplierReturnsApiGatewayUrl`, `SupplierReturnsFunctionHostName`, `SupplierReturnsStorageAccountName`, `SupplierReturnsBlobContainerName`, `SupplierReturnsTopicName`, `SupplierReturnsWarehouseSubscriptionName`, `SupplierReturnsFinanceSubscriptionName`, `SupplierReturnsWorkflowName`, `SupplierReturnsPostgresServerName`, `SupplierReturnsDatabaseName`, `SupplierReturnsKeyVaultName`, `SupplierReturnsAppConfigName`, `SupplierReturnsAppInsightsName`, `SupplierReturnsLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Basic enterprise integration on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/enterprise-integration/basic-enterprise-integration",
        why: "Baseline for API Management plus workflow orchestration in enterprise integration.",
      },
      {
        title: "Use a message broker and events to integrate enterprise systems",
        url: "https://learn.microsoft.com/en-us/azure/architecture/example-scenario/integration/queues-events",
        why: "Adds Service Bus and Event Grid as the durable asynchronous backbone for the workflow.",
      },
      {
        title: "Respond to Azure Service Bus events received using Azure Event Grid by using Azure Logic Apps",
        url: "https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-to-event-grid-integration-example",
        why: "Grounds the Service Bus plus Event Grid plus Logic Apps coordination path.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-supplier-returns-pulumi-91006",
      storageAccount: "azsupretpul91006",
      blobContainer: "supplier-return-docs",
      serviceBusNamespace: "sb-supplier-returns-91006",
      serviceBusTopic: "supplier-returns",
      warehouseSubscription: "warehouse",
      financeSubscription: "finance",
      eventGridTopic: "eg-supplier-returns-91006",
      functionAppPlan: "plan-supplier-returns-91006",
      functionApp: "func-supplier-returns-91006",
      apiManagementService: "apim-supplier-returns-91006",
      apiManagementApi: "supplier-returns-api",
      apiManagementProduct: "supplier-returns-product",
      logicWorkflow: "la-supplier-returns-91006",
      postgresServer: "pg-supplier-returns-91006",
      postgresDatabase: "returnsdb",
      keyVault: "kv-supplier-ret-91006",
      appConfigStore: "cfg-supplier-returns-91006",
      logAnalyticsWorkspace: "log-supplier-returns-91006",
      applicationInsights: "appi-supplier-returns-91006",
    },
    expectedOutputKeys: [
      "SupplierReturnsApiGatewayUrl",
      "SupplierReturnsFunctionHostName",
      "SupplierReturnsStorageAccountName",
      "SupplierReturnsBlobContainerName",
      "SupplierReturnsTopicName",
      "SupplierReturnsWarehouseSubscriptionName",
      "SupplierReturnsFinanceSubscriptionName",
      "SupplierReturnsWorkflowName",
      "SupplierReturnsPostgresServerName",
      "SupplierReturnsDatabaseName",
      "SupplierReturnsKeyVaultName",
      "SupplierReturnsAppConfigName",
      "SupplierReturnsAppInsightsName",
      "SupplierReturnsLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement",
      "web.",
      "logic.",
      "servicebus.",
      "eventgrid.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "dbforpostgresql.",
      "supplier-returns",
      "warehouse",
      "finance",
    ],
    forbiddenSourceMarkers: ["containerservice", "containerregistry", "cosmosdb", "frontdoor", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azsupretpul91006", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azsupretpul91006/blobServices/default/containers/supplier-return-docs", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-supplier-returns-91006", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-supplier-returns-91006/topics/supplier-returns", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-warehouse", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-supplier-returns-91006/topics/supplier-returns/subscriptions/warehouse", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-finance", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-supplier-returns-91006/topics/supplier-returns/subscriptions/finance", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-supplier-returns-91006", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-supplier-returns-91006", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-supplier-returns-91006", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-supplier-returns-91006", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-supplier-returns-91006/apis/supplier-returns-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-supplier-returns-91006/products/supplier-returns-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-supplier-returns-91006", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-supplier-returns-91006", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-supplier-returns-91006/databases/returnsdb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-supplier-ret-91006", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-supplier-returns-91006", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-supplier-returns-91006", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-supplier-returns-91006", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "f60c5415-0a86-4b76-8e0d-75bc1e5a5827",
    prId: "Pr91007",
    scenarioId: "fleet-telemetry-digital-thread",
    title: "Fleet telemetry digital thread",
    prompt: [
      "Our industrial operations team wants a single Azure landing zone for fleet telemetry before they build analytics on top of it. They need device ingress, high-volume event intake, a place to project telemetry into a digital-thread model, a durable archive, and the usual config, secret, and observability pieces. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure IoT Hub for device ingress, an Event Hubs namespace for the hot telemetry stream, a Function App as the event processor surface, an Azure Cosmos DB account with one SQL database and one container for recent telemetry state, an Azure Digital Twins instance for the digital-thread layer, an Event Grid topic for downstream notifications, a Blob Storage container for raw telemetry archives, App Configuration for rollout flags, Key Vault for shared secrets, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-fleet-telemetry-pulumi-91007`, storage account `azfleettele91007`, blob container `telemetry-archive`, IoT Hub `iot-fleet-telemetry-91007`, Event Hubs namespace `eh-fleet-telemetry-91007`, Event Hub `fleet-telemetry-stream`, Function App plan `plan-fleet-telemetry-91007`, Function App `func-fleet-telemetry-91007`, Cosmos DB account `cosmos-fleet-telemetry-91007`, Cosmos SQL database `TelemetryDb`, Cosmos SQL container `TelemetryReadings`, Azure Digital Twins instance `adt-fleet-telemetry-91007`, Event Grid topic `eg-fleet-telemetry-91007`, Key Vault `kv-fleet-tele-91007`, App Configuration store `cfg-fleet-telemetry-91007`, Log Analytics workspace `log-fleet-telemetry-91007`, and Application Insights component `appi-fleet-telemetry-91007`.",
      "",
      "Keep the storage account private and HTTPS-only. Keep the archive container private. This task is just the infrastructure shape for the telemetry landing zone; do not add Synapse, Databricks, AKS, Front Door, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `FleetTelemetryStorageAccountName`, `FleetTelemetryArchiveContainerName`, `FleetTelemetryIotHubName`, `FleetTelemetryEventHubNamespaceName`, `FleetTelemetryEventHubName`, `FleetTelemetryFunctionHostName`, `FleetTelemetryCosmosAccountName`, `FleetTelemetryCosmosDatabaseName`, `FleetTelemetryCosmosContainerName`, `FleetTelemetryDigitalTwinsName`, `FleetTelemetryEventGridTopicEndpoint`, `FleetTelemetryKeyVaultName`, `FleetTelemetryAppConfigName`, `FleetTelemetryAppInsightsName`, `FleetTelemetryLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Introduction to Azure IoT",
        url: "https://learn.microsoft.com/en-us/azure/iot/iot-introduction",
        why: "Provides the cloud-connected device pattern and the role of IoT Hub and Azure Digital Twins.",
      },
      {
        title: "Tutorial: Use Java functions with Azure Cosmos DB and Event Hubs",
        url: "https://learn.microsoft.com/en-us/azure/azure-functions/functions-event-hub-cosmos-db",
        why: "Grounds the Event Hubs, Function App, and Cosmos DB telemetry-processing path.",
      },
      {
        title: "Create endpoints in Azure Digital Twins",
        url: "https://learn.microsoft.com/en-us/azure/digital-twins/how-to-create-endpoints",
        why: "Grounds event routing from Azure Digital Twins to Event Grid, Event Hubs, or Service Bus endpoints.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-fleet-telemetry-pulumi-91007",
      storageAccount: "azfleettele91007",
      blobContainer: "telemetry-archive",
      iotHub: "iot-fleet-telemetry-91007",
      eventHubNamespace: "eh-fleet-telemetry-91007",
      eventHub: "fleet-telemetry-stream",
      functionAppPlan: "plan-fleet-telemetry-91007",
      functionApp: "func-fleet-telemetry-91007",
      cosmosAccount: "cosmos-fleet-telemetry-91007",
      cosmosDatabase: "TelemetryDb",
      cosmosContainer: "TelemetryReadings",
      digitalTwins: "adt-fleet-telemetry-91007",
      eventGridTopic: "eg-fleet-telemetry-91007",
      keyVault: "kv-fleet-tele-91007",
      appConfigStore: "cfg-fleet-telemetry-91007",
      logAnalyticsWorkspace: "log-fleet-telemetry-91007",
      applicationInsights: "appi-fleet-telemetry-91007",
    },
    expectedOutputKeys: [
      "FleetTelemetryStorageAccountName",
      "FleetTelemetryArchiveContainerName",
      "FleetTelemetryIotHubName",
      "FleetTelemetryEventHubNamespaceName",
      "FleetTelemetryEventHubName",
      "FleetTelemetryFunctionHostName",
      "FleetTelemetryCosmosAccountName",
      "FleetTelemetryCosmosDatabaseName",
      "FleetTelemetryCosmosContainerName",
      "FleetTelemetryDigitalTwinsName",
      "FleetTelemetryEventGridTopicEndpoint",
      "FleetTelemetryKeyVaultName",
      "FleetTelemetryAppConfigName",
      "FleetTelemetryAppInsightsName",
      "FleetTelemetryLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "devices.",
      "eventhub.",
      "web.",
      "documentdb.",
      "digitaltwins",
      "eventgrid.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "iot-fleet-telemetry-91007",
      "TelemetryDb",
      "TelemetryReadings",
    ],
    forbiddenSourceMarkers: ["containerservice", "containerregistry", "apimanagement", "frontdoor", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azfleettele91007", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azfleettele91007/blobServices/default/containers/telemetry-archive", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "iot-hub", provider: "Microsoft.Devices", typePath: "IotHubs/iot-fleet-telemetry-91007", apiVersion: "2023-06-30", expectedType: "Microsoft.Devices/IotHubs" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-fleet-telemetry-91007", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-fleet-telemetry-91007/eventhubs/fleet-telemetry-stream", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-fleet-telemetry-91007", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-fleet-telemetry-91007", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-fleet-telemetry-91007", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
      { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-fleet-telemetry-91007/sqlDatabases/TelemetryDb", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
      { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-fleet-telemetry-91007/sqlDatabases/TelemetryDb/containers/TelemetryReadings", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
      { label: "digital-twins", provider: "Microsoft.DigitalTwins", typePath: "digitalTwinsInstances/adt-fleet-telemetry-91007", apiVersion: "2023-01-31", expectedType: "Microsoft.DigitalTwins/digitalTwinsInstances" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-fleet-telemetry-91007", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-fleet-tele-91007", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-fleet-telemetry-91007", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-fleet-telemetry-91007", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-fleet-telemetry-91007", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "5f8a698b-7ead-4658-a66c-72a99fbcaf8c",
    prId: "Pr91008",
    scenarioId: "model-rollout-platform",
    title: "Model rollout platform",
    prompt: [
      "Our applied AI platform team wants a single Azure rollout plane for internal model-serving services. They need a cluster and registry for workloads, a place for release artifacts, a stable internal API surface for rollout operations, command and event channels for deployment automation, and the config, secret, identity, and telemetry pieces that make the platform supportable. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure Kubernetes Service as the workload cluster, Azure Container Registry for images, Blob Storage for rollout artifacts, App Configuration for rollout flags, Key Vault for secrets, one user-assigned managed identity for workload access, API Management for the rollout API facade, a Service Bus queue for rollout commands, an Event Grid topic for release notifications, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-model-rollout-pulumi-91008`, storage account `azrolloutpul91008`, blob container `rollout-artifacts`, Azure Container Registry `acrmodelroll91008`, AKS cluster `aks-model-rollout-91008`, managed identity `id-model-rollout-91008`, Key Vault `kv-model-rollout-91008`, App Configuration store `cfg-model-rollout-91008`, API Management service `apim-model-rollout-91008`, API Management API `model-rollout-api`, API Management product `model-rollout-product`, Service Bus namespace `sb-model-rollout-91008`, Service Bus queue `model-rollout-commands`, Event Grid topic `eg-model-rollout-91008`, Log Analytics workspace `log-model-rollout-91008`, and Application Insights component `appi-model-rollout-91008`.",
      "",
      "Keep the storage account private and HTTPS-only. Keep the artifact container private. This task is just the Azure platform slice for rollout control; do not add Front Door, private endpoints, PostgreSQL, Cosmos DB, Logic Apps, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ModelRolloutStorageAccountName`, `ModelRolloutArtifactContainerName`, `ModelRolloutRegistryName`, `ModelRolloutClusterName`, `ModelRolloutManagedIdentityName`, `ModelRolloutApiGatewayUrl`, `ModelRolloutQueueName`, `ModelRolloutEventGridTopicEndpoint`, `ModelRolloutKeyVaultName`, `ModelRolloutAppConfigName`, `ModelRolloutAppInsightsName`, `ModelRolloutLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Baseline architecture for an AKS cluster",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks/baseline-aks",
        why: "Grounds the cluster, Key Vault, and Log Analytics baseline for a production AKS platform.",
      },
      {
        title: "Microservices architecture on Azure Kubernetes Service",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-microservices/aks-microservices",
        why: "Grounds Container Registry, workload identity, and microservice platform concerns around AKS.",
      },
      {
        title: "Use Azure API Management with microservices deployed in Azure Kubernetes Service",
        url: "https://learn.microsoft.com/en-us/azure/api-management/api-management-kubernetes",
        why: "Grounds API Management as the API gateway in front of AKS-hosted microservices.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-model-rollout-pulumi-91008",
      storageAccount: "azrolloutpul91008",
      blobContainer: "rollout-artifacts",
      containerRegistry: "acrmodelroll91008",
      aksCluster: "aks-model-rollout-91008",
      managedIdentity: "id-model-rollout-91008",
      keyVault: "kv-model-rollout-91008",
      appConfigStore: "cfg-model-rollout-91008",
      apiManagementService: "apim-model-rollout-91008",
      apiManagementApi: "model-rollout-api",
      apiManagementProduct: "model-rollout-product",
      serviceBusNamespace: "sb-model-rollout-91008",
      serviceBusQueue: "model-rollout-commands",
      eventGridTopic: "eg-model-rollout-91008",
      logAnalyticsWorkspace: "log-model-rollout-91008",
      applicationInsights: "appi-model-rollout-91008",
    },
    expectedOutputKeys: [
      "ModelRolloutStorageAccountName",
      "ModelRolloutArtifactContainerName",
      "ModelRolloutRegistryName",
      "ModelRolloutClusterName",
      "ModelRolloutManagedIdentityName",
      "ModelRolloutApiGatewayUrl",
      "ModelRolloutQueueName",
      "ModelRolloutEventGridTopicEndpoint",
      "ModelRolloutKeyVaultName",
      "ModelRolloutAppConfigName",
      "ModelRolloutAppInsightsName",
      "ModelRolloutLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "containerregistry.",
      "containerservice.",
      "managedidentity",
      "keyvault.",
      "appconfiguration.",
      "apimanagement",
      "servicebus.",
      "eventgrid.",
      "storage.",
      "operationalinsights.",
      "insights.",
      "model-rollout",
      "rollout-artifacts",
    ],
    forbiddenSourceMarkers: ["cosmosdb", "dbforpostgresql", "logic.", "frontdoor", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azrolloutpul91008", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azrolloutpul91008/blobServices/default/containers/rollout-artifacts", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrmodelroll91008", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "aks-cluster", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-model-rollout-91008", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "managed-identity", provider: "Microsoft.ManagedIdentity", typePath: "userAssignedIdentities/id-model-rollout-91008", apiVersion: "2023-01-31", expectedType: "Microsoft.ManagedIdentity/userAssignedIdentities" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-model-rollout-91008", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-model-rollout-91008", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-model-rollout-91008", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-model-rollout-91008/apis/model-rollout-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-model-rollout-91008/products/model-rollout-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-model-rollout-91008", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-model-rollout-91008/queues/model-rollout-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-model-rollout-91008", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-model-rollout-91008", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-model-rollout-91008", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "869e13b1-c645-4f9c-bc73-cbbc8dcab58f",
    prId: "Pr91009",
    scenarioId: "digital-asset-edge-publishing",
    title: "Digital asset edge publishing",
    prompt: [
      "Our digital media team wants one Azure deployment for a secure publishing edge around product photos, campaign images, and brand files. They need a hardened public edge for asset delivery, policy enforcement in front of that edge, a durable asset store, an internal processing surface for asset lifecycle events, and the normal secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Put Azure Front Door in front of the asset origin, attach a WAF policy to that Front Door surface through a security policy, keep the assets in Blob Storage, use an Azure Function App for internal asset-processing hooks, publish downstream asset events through an Event Grid topic, store shared secrets in Key Vault, keep runtime configuration in App Configuration, and route diagnostics into Log Analytics and Application Insights.",
      "",
      "Use these exact resource names: resource group `rg-az-digital-asset-edge-pulumi-91009`, storage account `azassetedge91009`, blob container `published-assets`, Front Door profile `afd-asset-edge-91009`, Front Door endpoint `asset-edge-endpoint`, Front Door security policy `asset-edge-security-policy`, WAF policy `waf-asset-edge-91009`, Function App plan `plan-asset-edge-91009`, Function App `func-asset-edge-91009`, Event Grid topic `eg-asset-edge-91009`, Key Vault `kv-asset-edge-91009`, App Configuration store `cfg-asset-edge-91009`, Log Analytics workspace `log-asset-edge-91009`, and Application Insights component `appi-asset-edge-91009`.",
      "",
      "Keep the storage account private and HTTPS-only. Front Door is the only public entry point in this task. The blob container stays private. Keep this limited to the services above; do not add API Management, AKS, Cosmos DB, MySQL, PostgreSQL, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `DigitalAssetEdgeFrontDoorProfileName`, `DigitalAssetEdgeFrontDoorEndpointHostName`, `DigitalAssetEdgeWafPolicyName`, `DigitalAssetEdgeStorageAccountName`, `DigitalAssetEdgeBlobContainerName`, `DigitalAssetEdgeFunctionHostName`, `DigitalAssetEdgeEventGridTopicEndpoint`, `DigitalAssetEdgeKeyVaultName`, `DigitalAssetEdgeAppConfigName`, `DigitalAssetEdgeAppInsightsName`, `DigitalAssetEdgeLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Use Azure Front Door with Azure Storage blobs",
        url: "https://learn.microsoft.com/en-us/azure/frontdoor/scenario-storage-blobs",
        why: "Grounds Front Door as the secured edge and Blob Storage as the asset origin.",
      },
      {
        title: "Architecture best practices for Azure Front Door",
        url: "https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-front-door",
        why: "Grounds WAF, observability, and Key Vault-backed certificate and security posture around Front Door.",
      },
      {
        title: "Reacting to Azure Blob storage events",
        url: "https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-event-overview",
        why: "Grounds the Event Grid driven asset-event pattern behind the storage origin.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-digital-asset-edge-pulumi-91009",
      storageAccount: "azassetedge91009",
      blobContainer: "published-assets",
      frontDoorProfile: "afd-asset-edge-91009",
      frontDoorEndpoint: "asset-edge-endpoint",
      frontDoorSecurityPolicy: "asset-edge-security-policy",
      wafPolicy: "waf-asset-edge-91009",
      functionAppPlan: "plan-asset-edge-91009",
      functionApp: "func-asset-edge-91009",
      eventGridTopic: "eg-asset-edge-91009",
      keyVault: "kv-asset-edge-91009",
      appConfigStore: "cfg-asset-edge-91009",
      logAnalyticsWorkspace: "log-asset-edge-91009",
      applicationInsights: "appi-asset-edge-91009",
    },
    expectedOutputKeys: [
      "DigitalAssetEdgeFrontDoorProfileName",
      "DigitalAssetEdgeFrontDoorEndpointHostName",
      "DigitalAssetEdgeWafPolicyName",
      "DigitalAssetEdgeStorageAccountName",
      "DigitalAssetEdgeBlobContainerName",
      "DigitalAssetEdgeFunctionHostName",
      "DigitalAssetEdgeEventGridTopicEndpoint",
      "DigitalAssetEdgeKeyVaultName",
      "DigitalAssetEdgeAppConfigName",
      "DigitalAssetEdgeAppInsightsName",
      "DigitalAssetEdgeLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "cdn.",
      "storage.",
      "web.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "waf-asset-edge-91009",
      "asset-edge-security-policy",
      "published-assets",
    ],
    forbiddenSourceMarkers: ["apimanagement", "containerservice", "documentdb", "dbformysql", "dbforpostgresql", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azassetedge91009", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azassetedge91009/blobServices/default/containers/published-assets", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-asset-edge-91009", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-asset-edge-91009/afdEndpoints/asset-edge-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-asset-edge-91009/securityPolicies/asset-edge-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-asset-edge-91009", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-asset-edge-91009", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-asset-edge-91009", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-asset-edge-91009", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-asset-edge-91009", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-asset-edge-91009", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-asset-edge-91009", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-asset-edge-91009", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "37ed2b8f-7cc4-4680-8f0b-21297ec81e09",
    prId: "Pr91010",
    scenarioId: "pricing-entitlements-control-plane",
    title: "Pricing and entitlements control plane",
    prompt: [
      "Our commerce platform team wants one Azure deployment for pricing and entitlement decisions that sit behind internal and partner-facing APIs. They need a stable API surface, a low-latency serving path, a relational system of record, a durable invalidation lane when prices or entitlements change, and the normal secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Put Azure API Management in front of the pricing API, back that surface with an Azure Function App, use Azure Database for MySQL Flexible Server for the system of record, use Azure Cache for Redis for hot-path reads, use Azure Queue Storage for cache invalidation work, publish downstream business notifications through an Event Grid topic, store shared configuration in App Configuration, store secrets in Key Vault, and route diagnostics into Log Analytics and Application Insights.",
      "",
      "Use these exact resource names: resource group `rg-az-pricing-entitlements-pulumi-91010`, storage account `azpriceplane91010`, queue `cache-invalidation`, API Management service `apim-pricing-91010`, API Management API `pricing-api`, API Management product `pricing-product`, Function App plan `plan-pricing-91010`, Function App `func-pricing-91010`, MySQL flexible server `mysql-pricing-91010`, MySQL database `pricingdb`, Redis cache `redis-pricing-91010`, Event Grid topic `eg-pricing-91010`, Key Vault `kv-pricing-91010`, App Configuration store `cfg-pricing-91010`, Log Analytics workspace `log-pricing-91010`, and Application Insights component `appi-pricing-91010`.",
      "",
      "Keep the storage account private and HTTPS-only. API Management is the only public entry point in this task. The queue is for internal invalidation work only. Keep this limited to the services above; do not add AKS, Cosmos DB, Front Door, private endpoints, PostgreSQL, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `PricingApiGatewayUrl`, `PricingFunctionHostName`, `PricingStorageAccountName`, `PricingQueueName`, `PricingMySqlServerName`, `PricingMySqlDatabaseName`, `PricingRedisName`, `PricingEventGridTopicEndpoint`, `PricingKeyVaultName`, `PricingAppConfigName`, `PricingAppInsightsName`, `PricingLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Cache-Aside pattern",
        url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside",
        why: "Grounds the Redis-backed low-latency read pattern in front of a relational source of truth.",
      },
      {
        title: "Tutorial: Deploy a PHP, MySQL, and Redis app to Azure App Service",
        url: "https://learn.microsoft.com/en-us/azure/app-service/tutorial-php-mysql-app",
        why: "Grounds the MySQL and Redis pairing in a real Azure application architecture.",
      },
      {
        title: "Use Key Vault references as app settings in Azure App Service, Azure Functions, and Azure Logic Apps",
        url: "https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references",
        why: "Grounds Key Vault-backed configuration and secret resolution for the function surface.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-pricing-entitlements-pulumi-91010",
      storageAccount: "azpriceplane91010",
      queueName: "cache-invalidation",
      apiManagementService: "apim-pricing-91010",
      apiManagementApi: "pricing-api",
      apiManagementProduct: "pricing-product",
      functionAppPlan: "plan-pricing-91010",
      functionApp: "func-pricing-91010",
      mysqlServer: "mysql-pricing-91010",
      mysqlDatabase: "pricingdb",
      redisCache: "redis-pricing-91010",
      eventGridTopic: "eg-pricing-91010",
      keyVault: "kv-pricing-91010",
      appConfigStore: "cfg-pricing-91010",
      logAnalyticsWorkspace: "log-pricing-91010",
      applicationInsights: "appi-pricing-91010",
    },
    expectedOutputKeys: [
      "PricingApiGatewayUrl",
      "PricingFunctionHostName",
      "PricingStorageAccountName",
      "PricingQueueName",
      "PricingMySqlServerName",
      "PricingMySqlDatabaseName",
      "PricingRedisName",
      "PricingEventGridTopicEndpoint",
      "PricingKeyVaultName",
      "PricingAppConfigName",
      "PricingAppInsightsName",
      "PricingLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement",
      "web.",
      "dbformysql.",
      "cache.",
      "storage.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "cache-invalidation",
      "redis-pricing-91010",
    ],
    forbiddenSourceMarkers: ["containerservice", "documentdb", "frontdoor", "dbforpostgresql", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azpriceplane91010", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "queue-storage", provider: "Microsoft.Storage", typePath: "storageAccounts/azpriceplane91010/queueServices/default/queues/cache-invalidation", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/queueServices/queues" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-pricing-91010", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-pricing-91010/apis/pricing-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-pricing-91010/products/pricing-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-pricing-91010", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-pricing-91010", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-pricing-91010", apiVersion: "2023-06-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-pricing-91010/databases/pricingdb", apiVersion: "2023-06-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-pricing-91010", apiVersion: "2024-03-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-pricing-91010", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-pricing-91010", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-pricing-91010", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-pricing-91010", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-pricing-91010", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "32518083-6701-42d2-97f8-e5198ddd79d9",
    prId: "Pr91011",
    scenarioId: "migration-rehearsal-orchestration",
    title: "Migration rehearsal orchestration",
    prompt: [
      "Our data modernization team wants one Azure deployment for rehearsal cutovers before they move production databases. They need a workflow plane for runbook approvals, a migration service surface, a durable command lane for cutover steps, a shared file area for manifests and evidence, a target landing database, and the normal secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure Logic Apps for the orchestration workflow, Azure Database Migration Service for the migration control surface, a DMS project under that service for the rehearsal plan, Azure Files for manifests and cutover evidence, a Service Bus queue for cutover commands, an Event Grid topic for stage notifications, Azure Database for PostgreSQL Flexible Server for the landing database, App Configuration for shared workflow flags, Key Vault for secrets, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-migration-rehearsal-pulumi-91011`, storage account `azmigrehearse91011`, file share `cutover-bundles`, Logic App workflow `la-migration-91011`, Database Migration Service `dms-migration-91011`, DMS project `cutover-rehearsal`, Service Bus namespace `sb-migration-91011`, Service Bus queue `cutover-commands`, Event Grid topic `eg-migration-91011`, PostgreSQL flexible server `pg-migration-91011`, PostgreSQL database `rehearsaldb`, Key Vault `kv-migration-91011`, App Configuration store `cfg-migration-91011`, Log Analytics workspace `log-migration-91011`, and Application Insights component `appi-migration-91011`.",
      "",
      "Keep the storage account private and HTTPS-only. The file share is for internal runbooks and evidence only. The Service Bus queue is for internal commands only. Keep this limited to the services above; do not add API Management, AKS, Front Door, Cosmos DB, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `MigrationRehearsalStorageAccountName`, `MigrationRehearsalFileShareName`, `MigrationRehearsalWorkflowName`, `MigrationRehearsalDmsServiceName`, `MigrationRehearsalDmsProjectName`, `MigrationRehearsalQueueName`, `MigrationRehearsalEventGridTopicEndpoint`, `MigrationRehearsalPostgresServerName`, `MigrationRehearsalPostgresDatabaseName`, `MigrationRehearsalKeyVaultName`, `MigrationRehearsalAppConfigName`, `MigrationRehearsalAppInsightsName`, `MigrationRehearsalLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Database Migration Service documentation",
        url: "https://learn.microsoft.com/en-us/azure/dms/",
        why: "Grounds DMS as the managed migration control plane and project surface.",
      },
      {
        title: "FAQ about using Azure Database Migration Service",
        url: "https://learn.microsoft.com/en-us/azure/dms/faq",
        why: "Grounds operational behavior and the service's internal coordination patterns during migrations.",
      },
      {
        title: "Azure File Storage built-in connector reference",
        url: "https://learn.microsoft.com/en-us/azure/logic-apps/connectors/built-in/reference/azurefile/",
        why: "Grounds Azure Files as a workflow-connected file surface for cutover artifacts and evidence.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-migration-rehearsal-pulumi-91011",
      storageAccount: "azmigrehearse91011",
      fileShare: "cutover-bundles",
      logicWorkflow: "la-migration-91011",
      dmsService: "dms-migration-91011",
      dmsProject: "cutover-rehearsal",
      serviceBusNamespace: "sb-migration-91011",
      serviceBusQueue: "cutover-commands",
      eventGridTopic: "eg-migration-91011",
      postgresServer: "pg-migration-91011",
      postgresDatabase: "rehearsaldb",
      keyVault: "kv-migration-91011",
      appConfigStore: "cfg-migration-91011",
      logAnalyticsWorkspace: "log-migration-91011",
      applicationInsights: "appi-migration-91011",
    },
    expectedOutputKeys: [
      "MigrationRehearsalStorageAccountName",
      "MigrationRehearsalFileShareName",
      "MigrationRehearsalWorkflowName",
      "MigrationRehearsalDmsServiceName",
      "MigrationRehearsalDmsProjectName",
      "MigrationRehearsalQueueName",
      "MigrationRehearsalEventGridTopicEndpoint",
      "MigrationRehearsalPostgresServerName",
      "MigrationRehearsalPostgresDatabaseName",
      "MigrationRehearsalKeyVaultName",
      "MigrationRehearsalAppConfigName",
      "MigrationRehearsalAppInsightsName",
      "MigrationRehearsalLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "logic.",
      "datamigration.",
      "servicebus.",
      "eventgrid.",
      "storage.",
      "dbforpostgresql.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "cutover-rehearsal",
      "cutover-bundles",
    ],
    forbiddenSourceMarkers: ["apimanagement", "containerservice", "documentdb", "frontdoor", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azmigrehearse91011", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azmigrehearse91011/fileServices/default/shares/cutover-bundles", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-migration-91011", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-migration-91011", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
      { label: "dms-project", provider: "Microsoft.DataMigration", typePath: "services/dms-migration-91011/projects/cutover-rehearsal", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-migration-91011", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-migration-91011/queues/cutover-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-migration-91011", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-migration-91011", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-migration-91011/databases/rehearsaldb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-migration-91011", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-migration-91011", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-migration-91011", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-migration-91011", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "dc238ad9-664b-4c46-a18d-6e3bfa719dc4",
    prId: "Pr91012",
    scenarioId: "container-apps-operations-mesh",
    title: "Container Apps operations mesh",
    prompt: [
      "Our operations platform team wants one Azure deployment for an internal microservice mesh that handles order exceptions and fulfillment callbacks. They need a managed application environment, separate API and worker services, durable pub-sub fan-out, fast state reads, durable document storage, a transactional state store, and the standard secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure Container Apps for the workload surface with one managed environment and three container apps named for the API, worker, and receipt services. Use a Service Bus topic with two subscriptions for internal fan-out, Azure Cosmos DB with one SQL database and one container for operational state, Azure Cache for Redis for hot-path lookups, Blob Storage for receipt and evidence documents, App Configuration for runtime flags, Key Vault for shared secrets, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-ops-mesh-pulumi-91012`, storage account `azopsmesh91012`, blob container `receipt-evidence`, Container Apps environment `cae-ops-mesh-91012`, Container App `ca-order-api-91012`, Container App `ca-order-worker-91012`, Container App `ca-receipt-91012`, Service Bus namespace `sb-ops-mesh-91012`, Service Bus topic `ops-events`, Service Bus subscription `ops-worker`, Service Bus subscription `ops-receipt`, Cosmos DB account `cosmos-ops-mesh-91012`, Cosmos SQL database `OpsStateDb`, Cosmos SQL container `OrderState`, Redis cache `redis-ops-mesh-91012`, Key Vault `kv-ops-mesh-91012`, App Configuration store `cfg-ops-mesh-91012`, Log Analytics workspace `log-ops-mesh-91012`, and Application Insights component `appi-ops-mesh-91012`.",
      "",
      "Keep the storage account private and HTTPS-only. Keep the blob container private. This is an internal operations mesh, so do not add API Management, Front Door, AKS, private endpoints, Logic Apps, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `OpsMeshStorageAccountName`, `OpsMeshBlobContainerName`, `OpsMeshEnvironmentName`, `OpsMeshApiAppName`, `OpsMeshWorkerAppName`, `OpsMeshReceiptAppName`, `OpsMeshServiceBusNamespaceName`, `OpsMeshTopicName`, `OpsMeshWorkerSubscriptionName`, `OpsMeshReceiptSubscriptionName`, `OpsMeshCosmosAccountName`, `OpsMeshCosmosDatabaseName`, `OpsMeshCosmosContainerName`, `OpsMeshRedisName`, `OpsMeshKeyVaultName`, `OpsMeshAppConfigName`, `OpsMeshAppInsightsName`, `OpsMeshLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Deploy microservices with Azure Container Apps and Dapr",
        url: "https://learn.microsoft.com/en-us/azure/architecture/example-scenario/serverless/microservices-with-container-apps-dapr",
        why: "Grounds a production-style Container Apps microservice architecture with Service Bus, Redis, Cosmos DB, Blob Storage, and Azure Monitor.",
      },
      {
        title: "Architecture best practices for Azure Container Apps",
        url: "https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-container-apps",
        why: "Grounds the Container Apps environment, ingress, autoscaling, and observability posture for a managed microservice platform.",
      },
      {
        title: "Connect to Azure services via Dapr components in the Azure portal",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/dapr-component-connection",
        why: "Grounds the use of Service Bus and Redis-backed application integrations around Container Apps workloads.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-ops-mesh-pulumi-91012",
      storageAccount: "azopsmesh91012",
      blobContainer: "receipt-evidence",
      managedEnvironment: "cae-ops-mesh-91012",
      apiContainerApp: "ca-order-api-91012",
      workerContainerApp: "ca-order-worker-91012",
      receiptContainerApp: "ca-receipt-91012",
      serviceBusNamespace: "sb-ops-mesh-91012",
      serviceBusTopic: "ops-events",
      workerSubscription: "ops-worker",
      receiptSubscription: "ops-receipt",
      cosmosAccount: "cosmos-ops-mesh-91012",
      cosmosDatabase: "OpsStateDb",
      cosmosContainer: "OrderState",
      redisCache: "redis-ops-mesh-91012",
      keyVault: "kv-ops-mesh-91012",
      appConfigStore: "cfg-ops-mesh-91012",
      logAnalyticsWorkspace: "log-ops-mesh-91012",
      applicationInsights: "appi-ops-mesh-91012",
    },
    expectedOutputKeys: [
      "OpsMeshStorageAccountName",
      "OpsMeshBlobContainerName",
      "OpsMeshEnvironmentName",
      "OpsMeshApiAppName",
      "OpsMeshWorkerAppName",
      "OpsMeshReceiptAppName",
      "OpsMeshServiceBusNamespaceName",
      "OpsMeshTopicName",
      "OpsMeshWorkerSubscriptionName",
      "OpsMeshReceiptSubscriptionName",
      "OpsMeshCosmosAccountName",
      "OpsMeshCosmosDatabaseName",
      "OpsMeshCosmosContainerName",
      "OpsMeshRedisName",
      "OpsMeshKeyVaultName",
      "OpsMeshAppConfigName",
      "OpsMeshAppInsightsName",
      "OpsMeshLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "app.",
      "servicebus.",
      "documentdb.",
      "cache.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "ops-events",
      "OrderState",
      "cae-ops-mesh-91012",
    ],
    forbiddenSourceMarkers: ["apimanagement", "frontdoor", "containerservice", "private endpoint", "logic."],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azopsmesh91012", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azopsmesh91012/blobServices/default/containers/receipt-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-ops-mesh-91012", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "api-container-app", provider: "Microsoft.App", typePath: "containerApps/ca-order-api-91012", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "worker-container-app", provider: "Microsoft.App", typePath: "containerApps/ca-order-worker-91012", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "receipt-container-app", provider: "Microsoft.App", typePath: "containerApps/ca-receipt-91012", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-ops-mesh-91012", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-ops-mesh-91012/topics/ops-events", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-worker", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-ops-mesh-91012/topics/ops-events/subscriptions/ops-worker", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-receipt", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-ops-mesh-91012/topics/ops-events/subscriptions/ops-receipt", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-ops-mesh-91012", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
      { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-ops-mesh-91012/sqlDatabases/OpsStateDb", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
      { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-ops-mesh-91012/sqlDatabases/OpsStateDb/containers/OrderState", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-ops-mesh-91012", apiVersion: "2024-03-01", expectedType: "Microsoft.Cache/redis" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-ops-mesh-91012", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-ops-mesh-91012", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-ops-mesh-91012", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-ops-mesh-91012", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "9a31650c-8218-4e1c-b69d-561c8806fcd3",
    prId: "Pr91013",
    scenarioId: "partner-api-edge-control-plane",
    title: "Partner API edge control plane",
    prompt: [
      "Our partner engineering team wants one Azure deployment for a secure edge in front of partner APIs. They need a global HTTP edge, an API gateway behind that edge, a serverless integration surface for request processing, a workflow surface for partner escalations, a durable event lane for downstream notifications, and the standard secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Put Azure Front Door in front of Azure API Management, attach a WAF policy to the Front Door surface through a security policy, use an Azure Function App behind API Management for request processing, add a Logic App for partner escalation and exception workflows, publish downstream notifications through an Event Grid topic, keep partner payload archives in Blob Storage, store shared secrets in Key Vault, keep runtime configuration in App Configuration, and route diagnostics into Log Analytics and Application Insights.",
      "",
      "Use these exact resource names: resource group `rg-az-partner-edge-pulumi-91013`, storage account `azpartneredge91013`, blob container `partner-archives`, Front Door profile `afd-partner-edge-91013`, Front Door endpoint `partner-edge-endpoint`, Front Door security policy `partner-edge-security-policy`, WAF policy `waf-partner-edge-91013`, API Management service `apim-partner-edge-91013`, API Management API `partner-edge-api`, API Management product `partner-edge-product`, Function App plan `plan-partner-edge-91013`, Function App `func-partner-edge-91013`, Logic App workflow `la-partner-edge-91013`, Event Grid topic `eg-partner-edge-91013`, Key Vault `kv-partner-edge-91013`, App Configuration store `cfg-partner-edge-91013`, Log Analytics workspace `log-partner-edge-91013`, and Application Insights component `appi-partner-edge-91013`.",
      "",
      "Keep the storage account private and HTTPS-only. Front Door is the only public entry point in this task. The blob container stays private. Keep this limited to the services above; do not add AKS, Cosmos DB, MySQL, PostgreSQL, Service Bus, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `PartnerEdgeFrontDoorProfileName`, `PartnerEdgeFrontDoorEndpointHostName`, `PartnerEdgeApiGatewayUrl`, `PartnerEdgeFunctionHostName`, `PartnerEdgeWorkflowName`, `PartnerEdgeStorageAccountName`, `PartnerEdgeBlobContainerName`, `PartnerEdgeEventGridTopicEndpoint`, `PartnerEdgeKeyVaultName`, `PartnerEdgeAppConfigName`, `PartnerEdgeAppInsightsName`, `PartnerEdgeLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Architecture best practices for Azure Front Door",
        url: "https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-front-door",
        why: "Grounds the global edge, WAF, routing, and observability posture for Front Door.",
      },
      {
        title: "Azure API Management landing zone architecture",
        url: "https://learn.microsoft.com/en-us/azure/architecture/example-scenario/integration/app-gateway-internal-api-management-function",
        why: "Grounds API Management, Function App, and Key Vault-backed secure API delivery patterns.",
      },
      {
        title: "Basic enterprise integration on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/enterprise-integration/basic-enterprise-integration",
        why: "Grounds the Logic Apps and API-led orchestration path for partner-facing integrations.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-partner-edge-pulumi-91013",
      storageAccount: "azpartneredge91013",
      blobContainer: "partner-archives",
      frontDoorProfile: "afd-partner-edge-91013",
      frontDoorEndpoint: "partner-edge-endpoint",
      frontDoorSecurityPolicy: "partner-edge-security-policy",
      wafPolicy: "waf-partner-edge-91013",
      apiManagementService: "apim-partner-edge-91013",
      apiManagementApi: "partner-edge-api",
      apiManagementProduct: "partner-edge-product",
      functionAppPlan: "plan-partner-edge-91013",
      functionApp: "func-partner-edge-91013",
      logicWorkflow: "la-partner-edge-91013",
      eventGridTopic: "eg-partner-edge-91013",
      keyVault: "kv-partner-edge-91013",
      appConfigStore: "cfg-partner-edge-91013",
      logAnalyticsWorkspace: "log-partner-edge-91013",
      applicationInsights: "appi-partner-edge-91013",
    },
    expectedOutputKeys: [
      "PartnerEdgeFrontDoorProfileName",
      "PartnerEdgeFrontDoorEndpointHostName",
      "PartnerEdgeApiGatewayUrl",
      "PartnerEdgeFunctionHostName",
      "PartnerEdgeWorkflowName",
      "PartnerEdgeStorageAccountName",
      "PartnerEdgeBlobContainerName",
      "PartnerEdgeEventGridTopicEndpoint",
      "PartnerEdgeKeyVaultName",
      "PartnerEdgeAppConfigName",
      "PartnerEdgeAppInsightsName",
      "PartnerEdgeLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "cdn.",
      "apimanagement",
      "web.",
      "logic.",
      "eventgrid.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "partner-edge-security-policy",
      "partner-edge-api",
    ],
    forbiddenSourceMarkers: ["containerservice", "documentdb", "dbformysql", "dbforpostgresql", "servicebus.", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartneredge91013", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartneredge91013/blobServices/default/containers/partner-archives", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-partner-edge-91013", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-partner-edge-91013/afdEndpoints/partner-edge-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-partner-edge-91013/securityPolicies/partner-edge-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-partner-edge-91013", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-edge-91013", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-edge-91013/apis/partner-edge-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-edge-91013/products/partner-edge-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-partner-edge-91013", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-partner-edge-91013", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-partner-edge-91013", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-partner-edge-91013", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-partner-edge-91013", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-partner-edge-91013", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-partner-edge-91013", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-partner-edge-91013", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "fe89b0f0-4763-4b28-b158-7ad38e36ddc6",
    prId: "Pr91014",
    scenarioId: "event-stream-reconciliation-platform",
    title: "Event stream reconciliation platform",
    prompt: [
      "Our finance operations team wants one Azure deployment for reconciling high-volume event streams against downstream operational records. They need a streaming ingress plane, a serverless processor, a durable command lane for replays, a relational store for reconciliation state, a shared evidence area, and the standard secret, configuration, and telemetry plumbing. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure Event Hubs for the streaming ingress plane, an Azure Function App for the reconciliation processor, a Service Bus queue for replay and repair commands, Azure Database for PostgreSQL Flexible Server for reconciliation state, Azure Files for investigation bundles and evidence, an Event Grid topic for downstream exception notifications, App Configuration for rollout and throttle flags, Key Vault for shared secrets, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-recon-stream-pulumi-91014`, storage account `azreconstream91014`, file share `recon-evidence`, Event Hubs namespace `eh-recon-stream-91014`, Event Hub `recon-events`, Function App plan `plan-recon-stream-91014`, Function App `func-recon-stream-91014`, Service Bus namespace `sb-recon-stream-91014`, Service Bus queue `replay-commands`, PostgreSQL flexible server `pg-recon-stream-91014`, PostgreSQL database `recondb`, Event Grid topic `eg-recon-stream-91014`, Key Vault `kv-recon-stream-91014`, App Configuration store `cfg-recon-stream-91014`, Log Analytics workspace `log-recon-stream-91014`, and Application Insights component `appi-recon-stream-91014`.",
      "",
      "Keep the storage account private and HTTPS-only. The file share is for internal investigation and replay evidence only. Keep this limited to the services above; do not add API Management, Front Door, AKS, Cosmos DB, MySQL, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ReconStreamStorageAccountName`, `ReconStreamFileShareName`, `ReconStreamEventHubNamespaceName`, `ReconStreamEventHubName`, `ReconStreamFunctionHostName`, `ReconStreamServiceBusNamespaceName`, `ReconStreamQueueName`, `ReconStreamPostgresServerName`, `ReconStreamPostgresDatabaseName`, `ReconStreamEventGridTopicEndpoint`, `ReconStreamKeyVaultName`, `ReconStreamAppConfigName`, `ReconStreamAppInsightsName`, `ReconStreamLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Event-driven architecture style",
        url: "https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven",
        why: "Grounds the event ingress, consumer, and replay-oriented architecture style for reconciliation workloads.",
      },
      {
        title: "What is Azure Event Hubs",
        url: "https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about",
        why: "Grounds Event Hubs as the high-throughput streaming ingress layer and long-lived event log.",
      },
      {
        title: "Connect to eventing and messaging services in Azure Functions",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/serverless/event-processing",
        why: "Grounds the use of Azure Functions with Event Grid, Event Hubs, and Service Bus triggers in event-driven architectures.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-recon-stream-pulumi-91014",
      storageAccount: "azreconstream91014",
      fileShare: "recon-evidence",
      eventHubNamespace: "eh-recon-stream-91014",
      eventHub: "recon-events",
      functionAppPlan: "plan-recon-stream-91014",
      functionApp: "func-recon-stream-91014",
      serviceBusNamespace: "sb-recon-stream-91014",
      serviceBusQueue: "replay-commands",
      postgresServer: "pg-recon-stream-91014",
      postgresDatabase: "recondb",
      eventGridTopic: "eg-recon-stream-91014",
      keyVault: "kv-recon-stream-91014",
      appConfigStore: "cfg-recon-stream-91014",
      logAnalyticsWorkspace: "log-recon-stream-91014",
      applicationInsights: "appi-recon-stream-91014",
    },
    expectedOutputKeys: [
      "ReconStreamStorageAccountName",
      "ReconStreamFileShareName",
      "ReconStreamEventHubNamespaceName",
      "ReconStreamEventHubName",
      "ReconStreamFunctionHostName",
      "ReconStreamServiceBusNamespaceName",
      "ReconStreamQueueName",
      "ReconStreamPostgresServerName",
      "ReconStreamPostgresDatabaseName",
      "ReconStreamEventGridTopicEndpoint",
      "ReconStreamKeyVaultName",
      "ReconStreamAppConfigName",
      "ReconStreamAppInsightsName",
      "ReconStreamLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "eventhub.",
      "web.",
      "servicebus.",
      "dbforpostgresql.",
      "storage.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "replay-commands",
      "recon-events",
      "recon-evidence",
    ],
    forbiddenSourceMarkers: ["apimanagement", "frontdoor", "containerservice", "documentdb", "dbformysql", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azreconstream91014", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azreconstream91014/fileServices/default/shares/recon-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-recon-stream-91014", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-recon-stream-91014/eventhubs/recon-events", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-recon-stream-91014", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-recon-stream-91014", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-recon-stream-91014", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-recon-stream-91014/queues/replay-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-recon-stream-91014", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-recon-stream-91014/databases/recondb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-recon-stream-91014", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-recon-stream-91014", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-recon-stream-91014", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-recon-stream-91014", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-recon-stream-91014", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "b0a7d6e9-2a43-4f1d-a2db-98a0a9dd5c15",
    prId: "Pr91015",
    scenarioId: "multi-region-aks-edge-fabric",
    title: "Multi-region AKS edge fabric",
    prompt: [
      "Our platform reliability team wants one Azure deployment for an active/active platform that keeps critical control APIs online across two regions. They need two regional AKS clusters, regional network boundaries, regional application gateways in front of each cluster, one shared global edge, one shared registry for workload images, regional secrets and monitoring, and one shared configuration surface. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2` as the two regions.",
      "",
      "Use one Azure Front Door profile and endpoint with a security policy and WAF in front of two regional Application Gateways. Deploy one AKS cluster in `eastus` and one in `westus2`, one virtual network per region with a dedicated application gateway subnet and workload subnet, one shared Azure Container Registry for cluster images, one shared App Configuration store, one Key Vault per region, and one Log Analytics workspace per region. Keep the clusters and gateways internal to this platform surface; do not add API Management, Logic Apps, Cosmos DB, private endpoints, or custom domains.",
      "",
      "Use these exact resource names: resource group `rg-az-aks-fleet-pulumi-91015`, Front Door profile `afd-aks-fleet-91015`, Front Door endpoint `aks-fleet-endpoint`, Front Door security policy `aks-fleet-security-policy`, WAF policy `waf-aks-fleet-91015`, Container Registry `acraksfleet91015`, App Configuration store `cfg-aks-fleet-91015`, east virtual network `vnet-aks-east-91015`, east application gateway subnet `agw-east-snet`, east workload subnet `aks-east-snet`, east Application Gateway `agw-aks-east-91015`, east AKS cluster `aks-east-91015`, east Key Vault `kv-aks-east-91015`, east Log Analytics workspace `log-aks-east-91015`, west virtual network `vnet-aks-west-91015`, west application gateway subnet `agw-west-snet`, west workload subnet `aks-west-snet`, west Application Gateway `agw-aks-west-91015`, west AKS cluster `aks-west-91015`, west Key Vault `kv-aks-west-91015`, and west Log Analytics workspace `log-aks-west-91015`.",
      "",
      "The two virtual networks should be separate regional fabrics. Each Application Gateway should be internal to its regional virtual network and should be able to sit behind the shared Front Door profile as the regional edge target. Keep the registry shared across both clusters. Keep this limited to the services above.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `AksFleetFrontDoorProfileName`, `AksFleetFrontDoorEndpointHostName`, `AksFleetRegistryName`, `AksFleetAppConfigName`, `AksFleetEastVirtualNetworkName`, `AksFleetEastApplicationGatewayName`, `AksFleetEastClusterName`, `AksFleetEastKeyVaultName`, `AksFleetEastLogAnalyticsWorkspaceName`, `AksFleetWestVirtualNetworkName`, `AksFleetWestApplicationGatewayName`, `AksFleetWestClusterName`, `AksFleetWestKeyVaultName`, `AksFleetWestLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "AKS baseline for multiregion clusters",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
        why: "Grounds an active/active multi-region AKS platform with Front Door, Application Gateway, regional virtual networks, regional Key Vaults, and regional Log Analytics workspaces.",
      },
      {
        title: "What is Azure Application Gateway?",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/overview",
        why: "Grounds the layer 7 regional routing tier that sits in front of each cluster.",
      },
      {
        title: "Understanding DNS resolution in Application Gateway",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-dns-resolution",
        why: "Grounds the internal DNS and backend resolution requirements for regional application gateways.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-aks-fleet-pulumi-91015",
      frontDoorProfile: "afd-aks-fleet-91015",
      frontDoorEndpoint: "aks-fleet-endpoint",
      frontDoorSecurityPolicy: "aks-fleet-security-policy",
      wafPolicy: "waf-aks-fleet-91015",
      containerRegistry: "acraksfleet91015",
      appConfigStore: "cfg-aks-fleet-91015",
      eastVirtualNetwork: "vnet-aks-east-91015",
      eastApplicationGatewaySubnet: "agw-east-snet",
      eastWorkloadSubnet: "aks-east-snet",
      eastApplicationGateway: "agw-aks-east-91015",
      eastCluster: "aks-east-91015",
      eastKeyVault: "kv-aks-east-91015",
      eastLogAnalyticsWorkspace: "log-aks-east-91015",
      westVirtualNetwork: "vnet-aks-west-91015",
      westApplicationGatewaySubnet: "agw-west-snet",
      westWorkloadSubnet: "aks-west-snet",
      westApplicationGateway: "agw-aks-west-91015",
      westCluster: "aks-west-91015",
      westKeyVault: "kv-aks-west-91015",
      westLogAnalyticsWorkspace: "log-aks-west-91015",
    },
    expectedOutputKeys: [
      "AksFleetFrontDoorProfileName",
      "AksFleetFrontDoorEndpointHostName",
      "AksFleetRegistryName",
      "AksFleetAppConfigName",
      "AksFleetEastVirtualNetworkName",
      "AksFleetEastApplicationGatewayName",
      "AksFleetEastClusterName",
      "AksFleetEastKeyVaultName",
      "AksFleetEastLogAnalyticsWorkspaceName",
      "AksFleetWestVirtualNetworkName",
      "AksFleetWestApplicationGatewayName",
      "AksFleetWestClusterName",
      "AksFleetWestKeyVaultName",
      "AksFleetWestLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "cdn.",
      "network.",
      "containerservice.",
      "containerregistry.",
      "appconfiguration.",
      "keyvault.",
      "operationalinsights.",
      "aks-east-91015",
      "aks-west-91015",
      "agw-aks-east-91015",
      "agw-aks-west-91015",
      "vnet-aks-east-91015",
      "vnet-aks-west-91015",
    ],
    forbiddenSourceMarkers: ["apimanagement", "logic.", "documentdb", "servicebus.", "private endpoint"],
    integrationChecks: [
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-aks-fleet-91015", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-aks-fleet-91015/afdEndpoints/aks-fleet-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-aks-fleet-91015/securityPolicies/aks-fleet-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-aks-fleet-91015", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acraksfleet91015", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-aks-fleet-91015", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-aks-east-91015", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-aks-east-91015/subnets/agw-east-snet", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-workload-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-aks-east-91015/subnets/aks-east-snet", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-aks-east-91015", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "east-aks-cluster", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-east-91015", apiVersion: "2024-03-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "east-key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-aks-east-91015", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "east-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-aks-east-91015", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-aks-west-91015", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-aks-west-91015/subnets/agw-west-snet", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-workload-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-aks-west-91015/subnets/aks-west-snet", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-aks-west-91015", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "west-aks-cluster", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-west-91015", apiVersion: "2024-03-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "west-key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-aks-west-91015", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "west-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-aks-west-91015", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    ],
  },
  {
    poId: "2fa1b8dc-d6d8-4f7d-bf6d-0b7ef9669d55",
    prId: "Pr91016",
    scenarioId: "cutover-command-and-telemetry-mesh",
    title: "Cutover command and telemetry mesh",
    prompt: [
      "Our cutover operations team wants one Azure deployment for managing partner database cutovers across multiple release teams. They need an operator API surface, an approval workflow plane, a migration control plane, a streaming telemetry lane, a durable command queue, a shared evidence area, a target landing database, and the standard secret, configuration, and monitoring stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure API Management for the operator API surface with one API and one product, Azure Logic Apps for cutover approvals and escalations, Azure Database Migration Service with one project for the cutover plan, Azure Database for MySQL Flexible Server for the landing database, Azure Event Hubs for streaming operational telemetry, a Service Bus queue for cutover commands, Azure Files for manifests and evidence, Key Vault for secrets, App Configuration for rollout flags, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-cutover-command-pulumi-91016`, storage account `azcutoverops91016`, file share `cutover-evidence`, API Management service `apim-cutover-91016`, API Management API `cutover-api`, API Management product `cutover-product`, Logic App workflow `la-cutover-91016`, Database Migration Service `dms-cutover-91016`, DMS project `mysql-cutover-plan`, MySQL flexible server `mysql-cutover-91016`, MySQL database `cutoverdb`, Event Hubs namespace `eh-cutover-91016`, Event Hub `cutover-telemetry`, Service Bus namespace `sb-cutover-91016`, Service Bus queue `cutover-commands`, Key Vault `kv-cutover-91016`, App Configuration store `cfg-cutover-91016`, Log Analytics workspace `log-cutover-91016`, and Application Insights component `appi-cutover-91016`.",
      "",
      "Keep the storage account private and HTTPS-only. The file share is for internal manifests and evidence only. Keep this limited to the services above; do not add Front Door, AKS, Cosmos DB, PostgreSQL, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `CutoverOpsStorageAccountName`, `CutoverOpsFileShareName`, `CutoverOpsApiManagementName`, `CutoverOpsApiName`, `CutoverOpsProductName`, `CutoverOpsWorkflowName`, `CutoverOpsDmsServiceName`, `CutoverOpsDmsProjectName`, `CutoverOpsMySqlServerName`, `CutoverOpsMySqlDatabaseName`, `CutoverOpsEventHubNamespaceName`, `CutoverOpsEventHubName`, `CutoverOpsServiceBusNamespaceName`, `CutoverOpsQueueName`, `CutoverOpsKeyVaultName`, `CutoverOpsAppConfigName`, `CutoverOpsAppInsightsName`, `CutoverOpsLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Tutorial: Migrate MySQL to Azure Database for MySQL offline using DMS",
        url: "https://learn.microsoft.com/en-us/azure/dms/tutorial-mysql-azure-mysql-offline-portal",
        why: "Grounds Azure Database Migration Service and Azure Database for MySQL as the managed migration control and landing database surfaces.",
      },
      {
        title: "How to log events to Azure Event Hubs in Azure API Management",
        url: "https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-log-event-hubs",
        why: "Grounds the combination of API Management and Event Hubs for high-volume operational telemetry.",
      },
      {
        title: "Basic enterprise integration on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/enterprise-integration/basic-enterprise-integration",
        why: "Grounds Logic Apps and API-led workflow orchestration for operator-driven integration flows.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-cutover-command-pulumi-91016",
      storageAccount: "azcutoverops91016",
      fileShare: "cutover-evidence",
      apiManagementService: "apim-cutover-91016",
      apiManagementApi: "cutover-api",
      apiManagementProduct: "cutover-product",
      logicWorkflow: "la-cutover-91016",
      dmsService: "dms-cutover-91016",
      dmsProject: "mysql-cutover-plan",
      mysqlServer: "mysql-cutover-91016",
      mysqlDatabase: "cutoverdb",
      eventHubNamespace: "eh-cutover-91016",
      eventHub: "cutover-telemetry",
      serviceBusNamespace: "sb-cutover-91016",
      serviceBusQueue: "cutover-commands",
      keyVault: "kv-cutover-91016",
      appConfigStore: "cfg-cutover-91016",
      logAnalyticsWorkspace: "log-cutover-91016",
      applicationInsights: "appi-cutover-91016",
    },
    expectedOutputKeys: [
      "CutoverOpsStorageAccountName",
      "CutoverOpsFileShareName",
      "CutoverOpsApiManagementName",
      "CutoverOpsApiName",
      "CutoverOpsProductName",
      "CutoverOpsWorkflowName",
      "CutoverOpsDmsServiceName",
      "CutoverOpsDmsProjectName",
      "CutoverOpsMySqlServerName",
      "CutoverOpsMySqlDatabaseName",
      "CutoverOpsEventHubNamespaceName",
      "CutoverOpsEventHubName",
      "CutoverOpsServiceBusNamespaceName",
      "CutoverOpsQueueName",
      "CutoverOpsKeyVaultName",
      "CutoverOpsAppConfigName",
      "CutoverOpsAppInsightsName",
      "CutoverOpsLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement",
      "logic.",
      "datamigration.",
      "dbformysql.",
      "eventhub.",
      "servicebus.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "mysql-cutover-plan",
      "cutover-commands",
      "cutover-telemetry",
    ],
    forbiddenSourceMarkers: ["frontdoor", "containerservice", "documentdb", "dbforpostgresql", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azcutoverops91016", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azcutoverops91016/fileServices/default/shares/cutover-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-91016", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-91016/apis/cutover-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-91016/products/cutover-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-cutover-91016", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-91016", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
      { label: "dms-project", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-91016/projects/mysql-cutover-plan", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-cutover-91016", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-cutover-91016/databases/cutoverdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-cutover-91016", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-cutover-91016/eventhubs/cutover-telemetry", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-91016", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-91016/queues/cutover-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-cutover-91016", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-cutover-91016", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-cutover-91016", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-cutover-91016", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "6c1f5f4e-31ab-4a71-9d59-5a89a3bf6019",
    prId: "Pr91017",
    scenarioId: "private-routing-and-discovery-fabric",
    title: "Private routing and discovery fabric",
    prompt: [
      "Our plant integration team wants one Azure deployment for an internal routing and discovery fabric that fronts multiple plant services without public exposure. They need one shared virtual network, an internal application gateway for HTTP path routing, an internal load balancer for worker endpoints, a private DNS zone linked to the virtual network, a managed application environment for internal services, a durable command lane, fast session state, and the standard secret, configuration, and monitoring stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one virtual network with an application gateway subnet and a services subnet. Use an internal Azure Application Gateway for HTTP routing, an internal Azure Load Balancer for the worker surface, one Azure Private DNS zone linked to the virtual network, one Azure Container Apps environment with three internal-only container apps, a Service Bus queue for routing jobs, Azure Cache for Redis for session and token state, Key Vault for shared secrets, App Configuration for runtime flags, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-routing-fabric-pulumi-91017`, virtual network `vnet-routing-fabric-91017`, application gateway subnet `snet-gateway-91017`, services subnet `snet-services-91017`, private DNS zone `fabric.internal`, private DNS virtual network link `fabric-link-91017`, Application Gateway `agw-routing-91017`, Load Balancer `lb-routing-91017`, Container Apps environment `cae-routing-91017`, Container App `ca-orders-91017`, Container App `ca-workers-91017`, Container App `ca-admin-91017`, Service Bus namespace `sb-routing-91017`, Service Bus queue `routing-jobs`, Redis cache `redis-routing-91017`, Key Vault `kv-routing-91017`, App Configuration store `cfg-routing-91017`, Log Analytics workspace `log-routing-91017`, and Application Insights component `appi-routing-91017`.",
      "",
      "Keep everything private and internal-only. Do not add Front Door, API Management, AKS, Cosmos DB, PostgreSQL, MySQL, private endpoints, or custom domains. The Application Gateway and Load Balancer should both stay inside the virtual network.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `RoutingFabricVirtualNetworkName`, `RoutingFabricApplicationGatewayName`, `RoutingFabricLoadBalancerName`, `RoutingFabricPrivateDnsZoneName`, `RoutingFabricManagedEnvironmentName`, `RoutingFabricOrdersAppName`, `RoutingFabricWorkersAppName`, `RoutingFabricAdminAppName`, `RoutingFabricServiceBusNamespaceName`, `RoutingFabricQueueName`, `RoutingFabricRedisName`, `RoutingFabricKeyVaultName`, `RoutingFabricAppConfigName`, `RoutingFabricAppInsightsName`, `RoutingFabricLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "What is Azure Application Gateway?",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/overview",
        why: "Grounds the internal layer 7 routing tier for path-based application traffic.",
      },
      {
        title: "Understanding DNS resolution in Application Gateway",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/application-gateway-dns-resolution",
        why: "Grounds private DNS and backend resolution behavior inside the virtual network.",
      },
      {
        title: "Communicate between container apps in Azure Container Apps",
        url: "https://learn.microsoft.com/en-us/Azure/container-apps/connect-apps",
        why: "Grounds internal-only Container Apps environments and service-to-service routing inside a shared managed environment.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-routing-fabric-pulumi-91017",
      virtualNetwork: "vnet-routing-fabric-91017",
      applicationGatewaySubnet: "snet-gateway-91017",
      servicesSubnet: "snet-services-91017",
      privateDnsZone: "fabric.internal",
      privateDnsLink: "fabric-link-91017",
      applicationGateway: "agw-routing-91017",
      loadBalancer: "lb-routing-91017",
      managedEnvironment: "cae-routing-91017",
      ordersContainerApp: "ca-orders-91017",
      workersContainerApp: "ca-workers-91017",
      adminContainerApp: "ca-admin-91017",
      serviceBusNamespace: "sb-routing-91017",
      serviceBusQueue: "routing-jobs",
      redisCache: "redis-routing-91017",
      keyVault: "kv-routing-91017",
      appConfigStore: "cfg-routing-91017",
      logAnalyticsWorkspace: "log-routing-91017",
      applicationInsights: "appi-routing-91017",
    },
    expectedOutputKeys: [
      "RoutingFabricVirtualNetworkName",
      "RoutingFabricApplicationGatewayName",
      "RoutingFabricLoadBalancerName",
      "RoutingFabricPrivateDnsZoneName",
      "RoutingFabricManagedEnvironmentName",
      "RoutingFabricOrdersAppName",
      "RoutingFabricWorkersAppName",
      "RoutingFabricAdminAppName",
      "RoutingFabricServiceBusNamespaceName",
      "RoutingFabricQueueName",
      "RoutingFabricRedisName",
      "RoutingFabricKeyVaultName",
      "RoutingFabricAppConfigName",
      "RoutingFabricAppInsightsName",
      "RoutingFabricLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "network.",
      "app.",
      "servicebus.",
      "cache.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "PrivateRecordSet",
      "vnet-routing-fabric-91017",
      "agw-routing-91017",
      "lb-routing-91017",
      "fabric.internal",
      "routing-jobs",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbforpostgresql", "dbformysql", "private endpoint", "new azure.network.RecordSet("],
    integrationChecks: [
      { label: "virtual-network", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-routing-fabric-91017", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "gateway-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-routing-fabric-91017/subnets/snet-gateway-91017", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "services-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-routing-fabric-91017/subnets/snet-services-91017", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
      { label: "private-dns-link", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal/virtualNetworkLinks/fabric-link-91017", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-routing-91017", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "load-balancer", provider: "Microsoft.Network", typePath: "loadBalancers/lb-routing-91017", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/loadBalancers" },
      { label: "managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-routing-91017", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "orders-app", provider: "Microsoft.App", typePath: "containerApps/ca-orders-91017", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "workers-app", provider: "Microsoft.App", typePath: "containerApps/ca-workers-91017", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "admin-app", provider: "Microsoft.App", typePath: "containerApps/ca-admin-91017", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-routing-91017", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-routing-91017/queues/routing-jobs", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-routing-91017", apiVersion: "2024-03-01", expectedType: "Microsoft.Cache/redis" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-routing-91017", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-routing-91017", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-routing-91017", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-routing-91017", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
];

function selectedScenarios() {
  if (bundleFilter.length === 0) return scenarios;
  const selected = scenarios.filter((scenario) => bundleFilter.includes(scenario.prId) || bundleFilter.includes(scenario.scenarioId));
  if (selected.length === 0) {
    throw new Error(`No complex Pulumi scenario matched --bundle=${bundleFilter.join(",")}`);
  }
  return selected;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (options.mirror !== false) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (options.mirror !== false) process.stderr.write(chunk);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function solutionFiles() {
  return [
    "Pulumi.yaml",
    "package.json",
    "tsconfig.json",
    "bin/tap.ts",
    "lib/tap-stack.ts",
    "test/tap-stack.unit.test.mjs",
    "test/tap-stack.int.test.mjs",
  ];
}

function pulumiYaml() {
  return `name: tap-stack\nruntime: nodejs\nmain: bin/tap.ts\n`;
}

function packageJson() {
  return `${JSON.stringify(
    {
      name: "tap-stack",
      private: true,
      main: "bin/tap.ts",
      dependencies: {
        "@pulumi/azure-native": "^2.80.0",
        "@pulumi/pulumi": "^3.122.0",
        "@types/node": "^20.0.0",
        "ts-node": "^10.9.2",
        typescript: "^5.0.0",
      },
    },
    null,
    2,
  )}\n`;
}

function tsconfigJson() {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ["bin/**/*.ts", "lib/**/*.ts"],
    },
    null,
    2,
  )}\n`;
}

function entrypoint(outputKeys) {
  const exports = outputKeys
    .map((key) => `export const ${key} = stack.${key};`)
    .join("\n");
  return `import { createTapStack } from "../lib/tap-stack";\n\nconst stack = createTapStack();\n\n${exports}\n`;
}

function unitTest() {
  return `import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));

for (const relativePath of metadata.solutionFiles) {
  if (!existsSync(join(root, relativePath))) {
    throw new Error(\`missing required solution file \${relativePath}\`);
  }
}

const pulumiYaml = await readFile(join(root, "Pulumi.yaml"), "utf8");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const entry = await readFile(join(root, "bin", "tap.ts"), "utf8");
const stack = await readFile(join(root, "lib", "tap-stack.ts"), "utf8");

for (const marker of ["runtime: nodejs", "main: bin/tap.ts"]) {
  if (!pulumiYaml.includes(marker)) {
    throw new Error(\`Pulumi.yaml is missing \${marker}\`);
  }
}

for (const dependency of ["@pulumi/azure-native", "@pulumi/pulumi", "@types/node", "ts-node", "typescript"]) {
  if (!packageJson.dependencies?.[dependency]) {
    throw new Error(\`package.json is missing dependency \${dependency}\`);
  }
}

for (const marker of ["createTapStack", "../lib/tap-stack"]) {
  if (!entry.includes(marker)) {
    throw new Error(\`bin/tap.ts is missing \${marker}\`);
  }
}

for (const outputKey of metadata.expectedOutputKeys) {
  if (!entry.includes(\`export const \${outputKey} = stack.\${outputKey};\`)) {
    throw new Error(\`bin/tap.ts is missing output export \${outputKey}\`);
  }
}

if (!stack.includes("export function createTapStack")) {
  throw new Error("lib/tap-stack.ts must export createTapStack");
}

for (const value of Object.values(metadata.resourceNames)) {
  if (typeof value === "string" && !stack.includes(value)) {
    throw new Error(\`lib/tap-stack.ts is missing prompt-fixed value \${value}\`);
  }
}

for (const outputKey of metadata.expectedOutputKeys) {
  if (!stack.includes(outputKey)) {
    throw new Error(\`lib/tap-stack.ts is missing output key \${outputKey}\`);
  }
}

for (const marker of metadata.requiredSourceMarkers ?? []) {
  if (!stack.toLowerCase().includes(String(marker).toLowerCase())) {
    throw new Error(\`lib/tap-stack.ts is missing required scenario marker \${marker}\`);
  }
}

for (const forbidden of metadata.forbiddenSourceMarkers ?? []) {
  if (stack.toLowerCase().includes(String(forbidden).toLowerCase())) {
    throw new Error(\`lib/tap-stack.ts contains forbidden marker \${forbidden}\`);
  }
}

console.log("unit assertions passed");
`;
}

function integrationTest() {
  return `import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));
const endpoint = (process.env.AZURE_RESOURCE_MANAGER_ENDPOINT ?? process.env.ARM_ENDPOINT ?? "").replace(/\\/$/, "");
if (!endpoint) {
  throw new Error("AZURE_RESOURCE_MANAGER_ENDPOINT or ARM_ENDPOINT must be set");
}
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID;
const token = JSON.parse(await readFile(process.env.AZURE_ACCESS_TOKEN_PATH, "utf8")).access_token;
const rawOutputs = JSON.parse(await readFile(process.env.AZURE_DEPLOYMENT_OUTPUTS_PATH, "utf8"));
const resourceGroup = metadata.resourceNames.resourceGroup;

for (const outputKey of metadata.expectedOutputKeys) {
  if (!(outputKey in rawOutputs)) {
    throw new Error(\`missing output \${outputKey}\`);
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: \`Bearer \${token}\`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(\`GET \${url} failed with \${response.status}\`);
  }
  return response.json();
}

const rgPayload = await getJson(\`\${endpoint}/subscriptions/\${subscriptionId}/resourcegroups/\${resourceGroup}?api-version=2021-04-01\`);
if (rgPayload.name !== resourceGroup) {
  throw new Error("resource group readback mismatch");
}

function expectedArmName(check) {
  if (check.expectedArmName) {
    return check.expectedArmName;
  }
  return check.typePath
    .split("/")
    .filter((_, index) => index % 2 === 1)
    .join("/");
}

for (const check of metadata.integrationChecks) {
  const url = \`\${endpoint}/subscriptions/\${subscriptionId}/resourceGroups/\${resourceGroup}/providers/\${check.provider}/\${check.typePath}?api-version=\${check.apiVersion}\`;
  const payload = await getJson(url);
  if (payload.name !== expectedArmName(check)) {
    throw new Error(\`unexpected resource name for \${check.label}: \${payload.name}\`);
  }
  if (payload.type !== check.expectedType) {
    throw new Error(\`unexpected resource type for \${check.label}: \${payload.type}\`);
  }
}

console.log("integration assertions passed");
`;
}

function metadataForScenario(scenario) {
  return {
    provider: "GlobalStack",
    cloud: "azure",
    model,
    platformId: "azure-pulumi-ts",
    scenarioId: scenario.scenarioId,
    promptPath: "lib/PROMPT.md",
    fieldReferences: scenario.fieldReferences,
    solutionFiles: solutionFiles(),
    expectedOutputKeys: scenario.expectedOutputKeys,
    resourceNames: scenario.resourceNames,
    requiredSourceMarkers: scenario.requiredSourceMarkers,
    forbiddenSourceMarkers: [...scenario.forbiddenSourceMarkers, "@pulumi/random", "random."],
    integrationChecks: scenario.integrationChecks,
    stageCommands: {
      "unit-tests": "node test/tap-stack.unit.test.mjs",
      "integration-tests": "node test/tap-stack.int.test.mjs",
    },
  };
}

function armContract(scenario) {
  const outputs = Object.fromEntries(scenario.expectedOutputKeys.map((key) => [key, { type: "string", value: key }]));
  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      location: { type: "string" },
      resourceGroupName: { type: "string" },
      storageAccountName: { type: "string" },
    },
    resources: [
      {
        type: "Microsoft.Resources/resourceGroups",
        apiVersion: "2022-09-01",
        name: "[parameters('resourceGroupName')]",
        location: "[parameters('location')]",
        tags: {
          purpose: "globalstack-complex-pulumi-bundle",
        },
      },
      {
        type: "Microsoft.Resources/deployments",
        apiVersion: "2022-09-01",
        name: `${scenario.scenarioId}-workload`,
        resourceGroup: "[parameters('resourceGroupName')]",
        properties: {
          mode: "Incremental",
          parameters: {
            location: { value: "[parameters('location')]" },
            storageAccountName: { value: "[parameters('storageAccountName')]" },
          },
          template: {
            $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
            contentVersion: "1.0.0.0",
            parameters: {
              location: { type: "string" },
              storageAccountName: { type: "string" },
            },
            resources: [
              {
                type: "Microsoft.Storage/storageAccounts",
                apiVersion: "2023-01-01",
                name: "[parameters('storageAccountName')]",
                location: "[parameters('location')]",
                kind: "StorageV2",
                sku: { name: "Standard_LRS" },
                properties: {
                  allowBlobPublicAccess: false,
                  minimumTlsVersion: "TLS1_2",
                  supportsHttpsTrafficOnly: true,
                },
              },
            ],
          },
        },
      },
    ],
    outputs,
  };
}

function armParameters(scenario) {
  return {
    $schema: "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      location: { value: location },
      resourceGroupName: { value: scenario.resourceNames.resourceGroup },
      storageAccountName: { value: scenario.resourceNames.storageAccount },
    },
  };
}

function generationHints(scenario) {
  const hints = [
    "You are generating the missing Pulumi implementation for an Azure IaC task.",
    "Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\".",
    "Do not return any prose before or after the fenced code block.",
    "Use only APIs and resource classes that exist in @pulumi/azure-native v2.80.0.",
    "The task must be fully self-contained. Do not require Pulumi stack config, environment variables, or manual operator input for names, passwords, or secrets.",
    "Do not use new pulumi.Config(), config.require(...), config.requireSecret(...), or config.getSecret(...) in this file. Use deterministic, strong, prompt-scoped constants when credentials are required.",
    "When the stack creates a ResourceGroup, instantiate it first and pass resourceGroupName: resourceGroup.name to downstream resources instead of reusing the raw resource group string. That creates the correct dependency edge.",
    "Do not use @pulumi/random or any random suffix generation.",
    "For StorageAccount, use enableHttpsTrafficOnly rather than supportsHttpsTrafficOnly.",
    "Do not invent unsupported convenience properties on Azure Database for PostgreSQL Flexible Server.",
    "When using azure.apimanagement.ProductApi, pass the prompt-fixed productId and apiId string identifiers directly; do not read .productId or .apiId from created resources.",
    "If a constructor input expects a fixed Azure identifier like apiId, productId, endpointName, queueName, or topicName, prefer the prompt-fixed string instead of reading a non-existent output property.",
    "When using operationalinsights.getWorkspaceSharedKeysOutput, do not access .primarySharedKey directly on the Output. Derive it with workspaceKeys.apply(keys => keys.primarySharedKey ?? \"\") so strict TypeScript accepts it.",
    "When creating azure.servicebus.Subscription resources for a topic, add an explicit dependsOn: [topic] option so subscriptions are created only after the topic exists.",
  ];

  if (scenario.prompt.toLowerCase().includes('front door')) {
    hints.push("For Azure Front Door, use azure.cdn.Profile, AFDEndpoint, AFDOriginGroup, AFDOrigin, Route, and SecurityPolicy.");
    hints.push("For azure.network.WebApplicationFirewallPolicy, use policySettings.state, not policySettings.enabledState.");
    hints.push("For azure.cdn.Route, use originGroup, not origins. Keep enabledState, supportedProtocols, patternsToMatch, forwardingProtocol, httpsRedirect, and linkToDefaultDomain on the route.");
    hints.push("For Front Door WAF and security policy, create azure.network.WebApplicationFirewallPolicy and then attach it through azure.cdn.SecurityPolicy.");
  }

  if (scenario.prompt.toLowerCase().includes('application gateway')) {
    hints.push("For Azure Application Gateway, use azure.network.ApplicationGateway and include frontendIPConfigurations, frontendPorts, backendAddressPools, backendHttpSettingsCollection, httpListeners, and requestRoutingRules.");
    hints.push("For internal-only Application Gateway deployments, use subnet.id on the frontend IP configuration instead of a public IP resource.");
    hints.push("Use Application Gateway v2 SKUs for production-grade deployments. Set sku.name and sku.tier to Standard_v2 or WAF_v2.");
    hints.push("Do not reference the ApplicationGateway resource variable inside its own constructor. Precompute child resource IDs from the fixed gateway name, subscription ID, and resource group name.");
  }

  if (scenario.prompt.toLowerCase().includes('load balancer')) {
    hints.push("For Azure Load Balancer, use azure.network.LoadBalancer with frontendIPConfigurations, backendAddressPools, loadBalancingRules, and probes.");
    hints.push("For internal load balancers, put the frontend IP configuration on a subnet and use a fixed privateIPAddress.");
  }

  if (scenario.prompt.toLowerCase().includes('private dns')) {
    hints.push("For Azure Private DNS, use azure.network.PrivateZone, VirtualNetworkLink, and PrivateRecordSet resources with prompt-fixed zone and record names.");
  }

  if (scenario.prompt.toLowerCase().includes('aks') || scenario.prompt.toLowerCase().includes('managed cluster')) {
    hints.push("For AKS, use azure.containerservice.ManagedCluster with SystemAssigned identity, explicit dnsPrefix values, and distinct regional names.");
    hints.push("Do not use Fleet or unsupported AKS convenience surfaces unless the prompt explicitly asks for them.");
    hints.push("For AKS networkProfile, use serviceCidr, dnsServiceIP, networkPlugin, loadBalancerSku, and outboundType. Do not use dockerBridgeCidr.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('apimanagement'))) {
    hints.push("For API Management, use azure.apimanagement.ApiManagementService, Api, Product, and ProductApi. Do not use a nonexistent azure.apimanagement.Service class.");
    hints.push("ApiManagementService requires resourceGroupName, serviceName, location, publisherEmail, publisherName, and sku. Use Developer or Consumption sku names that exist in Azure Native.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('dbformysql.'))) {
    hints.push("For Azure Database for MySQL Flexible Server in Azure Native, use azure.dbformysql.Server and azure.dbformysql.Database. Do not use a nonexistent FlexibleServer class.");
    hints.push("Use resourceGroupName, serverName, location, administratorLogin, administratorLoginPassword, version, sku, storage, and backup on azure.dbformysql.Server.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('datamigration.'))) {
    hints.push("For azure.datamigration.Service, use groupName, serviceName, location, sku, and virtualSubnetId. Do not use resourceGroupName on this resource.");
    hints.push("Use Database Migration Service sku.name Standard_1vCore unless the prompt explicitly requires a different exact DMS sku.");
    hints.push("For azure.datamigration.Project, use groupName, serviceName, projectName, location, sourcePlatform, and targetPlatform. Do not use resourceGroupName on this resource.");
    hints.push("For azure.datamigration.Project, use Azure Native platform enum spellings. PostgreSql is a source platform. AzureDbForPostgreSql is the PostgreSQL target platform. AzureDbForMySql is the MySQL target platform.");
  }

  return hints;
}

function openAiInput(scenario, prompt) {
  return [
    ...generationHints(scenario),
    prompt,
  ].join("\n");
}

function extractTapStack(markdown) {
  const match = markdown.match(/```[^\n]*path=["']lib\/tap-stack\.ts["'][^\n]*\n([\s\S]*?)```/i);
  if (!match) {
    throw new Error("model response did not include a fenced code block for lib/tap-stack.ts");
  }
  return match[1].trimEnd() + "\n";
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const parts = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

async function callOpenAI(scenario, prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  const startedAt = Date.now();
  console.log(`calling ${model}...`);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(180000),
    body: JSON.stringify({
      model,
      input: openAiInput(scenario, prompt),
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      text: { verbosity: "low" },
    }),
  });
  const body = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`OpenAI Responses API failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  console.log(`model response received in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  return outputText(body);
}

function validateTapStack(scenario, tapStackText) {
  if (!tapStackText.includes("export function createTapStack")) {
    throw new Error("missing export function createTapStack");
  }
  if (/\bnew\s+pulumi\.Config\s*\(/.test(tapStackText) || /\.requireSecret?\s*\(/.test(tapStackText) || /\.getSecret\s*\(/.test(tapStackText)) {
    throw new Error("tap-stack.ts must be self-contained and must not depend on Pulumi config or secret config");
  }
  for (const value of Object.values(scenario.resourceNames)) {
    if (typeof value === "string" && !tapStackText.includes(value)) {
      throw new Error(`missing resource name ${value}`);
    }
  }
  for (const outputKey of scenario.expectedOutputKeys) {
    if (!tapStackText.includes(outputKey)) {
      throw new Error(`missing output key ${outputKey}`);
    }
  }
  for (const marker of scenario.requiredSourceMarkers) {
    if (!tapStackText.toLowerCase().includes(String(marker).toLowerCase())) {
      throw new Error(`missing scenario marker ${marker}`);
    }
  }
  for (const forbidden of scenario.forbiddenSourceMarkers) {
    if (tapStackText.toLowerCase().includes(String(forbidden).toLowerCase())) {
      throw new Error(`contains forbidden marker ${forbidden}`);
    }
  }
  if (scenario.prompt.toLowerCase().includes('private dns')
    && tapStackText.includes('new azure.network.RecordSet(')) {
    throw new Error('private DNS scenarios must use azure.network.PrivateRecordSet, not azure.network.RecordSet');
  }
}

function repairPrompt(scenario, originalPrompt, error, previousResponse) {
  return [
    originalPrompt,
    "",
    "The previous draft did not meet the task contract.",
    `Repair these exact issues: ${error}`,
    "Return a complete replacement for lib/tap-stack.ts only.",
    "",
    "Previous draft:",
    previousResponse,
  ].join("\n");
}

function runtimeRepairPrompt(scenario, originalPrompt, runFailure, previousTapStack) {
  const extraGuidance = [];
  if (String(runFailure).includes('Microsoft.ServiceBus/namespaces/topics/subscriptions')
    && String(runFailure).includes('ParentResourceNotFound')) {
    extraGuidance.push('Ensure every azure.servicebus.Subscription for a topic includes an explicit dependsOn: [topic] option.');
  }
  if (String(runFailure).includes('dockerBridgeCidr')) {
    extraGuidance.push('For AKS networkProfile, remove dockerBridgeCidr and use serviceCidr plus dnsServiceIP instead.');
  }
  if (String(runFailure).includes('ApplicationGatewaySkuNotSupported')) {
    extraGuidance.push('Use Azure Application Gateway v2. Set sku.name and sku.tier to Standard_v2 or WAF_v2.');
  }
  if ((String(runFailure).includes('used before its declaration') || String(runFailure).includes('referenced directly or indirectly in its own initializer'))
    && (String(runFailure).includes('eastAgw') || String(runFailure).includes('westAgw'))) {
    extraGuidance.push('Do not reference eastAgw or westAgw inside their own constructors. Build listener, frontend port, backend pool, and backend settings IDs from fixed gateway names and resource IDs instead.');
  }
  if (String(runFailure).includes('origins')
    && String(runFailure).includes('RouteArgs')) {
    extraGuidance.push('For azure.cdn.Route, remove origins and use originGroup instead.');
  }
  if (String(runFailure).includes('CdnWebApplicationFirewallPolicy')) {
    extraGuidance.push('Use azure.network.WebApplicationFirewallPolicy for Front Door WAF, then attach it with azure.cdn.SecurityPolicy.');
  }
  if (String(runFailure).includes('privateZoneName')
    && String(runFailure).includes('RecordSetArgs')) {
    extraGuidance.push('For private DNS records, use azure.network.PrivateRecordSet instead of azure.network.RecordSet.');
  }
  if (String(runFailure).includes('ParentResourceNotFound')
    && String(runFailure).includes('Microsoft.Network/dnsZones/A')) {
    extraGuidance.push('You used public DNS record-set semantics against a private DNS zone. Replace azure.network.RecordSet with azure.network.PrivateRecordSet and use privateZoneName instead of zoneName.');
  }
  if (String(runFailure).includes('Property \'Service\' does not exist on type')
    && String(runFailure).includes('apimanagement')) {
    extraGuidance.push('Use azure.apimanagement.ApiManagementService instead of any nonexistent Service class.');
  }
  if (String(runFailure).includes('Property \'FlexibleServer\' does not exist')
    && String(runFailure).includes('dbformysql')) {
    extraGuidance.push('Use azure.dbformysql.Server and azure.dbformysql.Database for MySQL flexible server resources.');
  }
  if (String(runFailure).includes('virtualSubnetId')
    && String(runFailure).includes('ServiceArgs')) {
    extraGuidance.push('For azure.datamigration.Service, keep virtualSubnetId and use groupName instead of resourceGroupName.');
  }
  if (String(runFailure).includes('InvalidSku')
    && String(runFailure).includes('Database Migration Service')) {
    extraGuidance.push('Use Database Migration Service sku.name Standard_1vCore.');
  }
  if (String(runFailure).includes('ResourceGroupNotFound')) {
    extraGuidance.push('Create the ResourceGroup first and pass resourceGroup.name to every downstream Azure resource instead of the raw resource group string.');
    extraGuidance.push('If a resource uses a fixed resource group name string while the ResourceGroup is being created in the same stack, replace it with the ResourceGroup output so Pulumi builds the dependency graph correctly.');
  }
  if (String(runFailure).includes('Missing required configuration variable')) {
    extraGuidance.push('Remove Pulumi config usage. Do not use new pulumi.Config(), require(), requireSecret(), or stack config for this task.');
    extraGuidance.push('Replace missing config variables with deterministic, strong, prompt-scoped constants in lib/tap-stack.ts so the bundle is self-contained.');
  }
  return [
    originalPrompt,
    "",
    "The previous lib/tap-stack.ts failed in the real shipment runner.",
    "Repair the implementation so it keeps the same scenario contract but addresses these exact errors:",
    runFailure,
    ...extraGuidance,
    "Keep the exact resource names and output keys unchanged.",
    "Return a complete replacement for lib/tap-stack.ts only.",
    "",
    "Previous lib/tap-stack.ts:",
    "```ts path=\"lib/tap-stack.ts\"",
    previousTapStack.trimEnd(),
    "```",
  ].join("\n");
}

async function generateTapStack(scenario) {
  let prompt = scenario.prompt;
  let lastResponse = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`generating ${scenario.prId} attempt ${attempt}/3`);
    const response = await callOpenAI(scenario, prompt);
    lastResponse = response;
    try {
      const tapStackText = extractTapStack(response);
      validateTapStack(scenario, tapStackText);
      return tapStackText;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`${scenario.prId} generation failed after 3 attempts: ${error.message}`);
      }
      prompt = repairPrompt(scenario, scenario.prompt, error.message, lastResponse);
    }
  }
  throw new Error(`unreachable: ${scenario.prId}`);
}

async function writeBundle(scenario, tapStackText) {
  const bundleDir = path.join(verifiedRoot, scenario.poId, scenario.prId);
  const runtimeDir = path.join(runtimeRoot, scenario.poId, scenario.prId);

  await rm(bundleDir, { recursive: true, force: true });
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(path.join(bundleDir, "bin"), { recursive: true });
  await mkdir(path.join(bundleDir, "lib"), { recursive: true });
  await mkdir(path.join(bundleDir, "test"), { recursive: true });
  await mkdir(path.join(bundleDir, "globalstack"), { recursive: true });
  await mkdir(path.join(runtimeDir, "globalstack"), { recursive: true });

  const metadata = metadataForScenario(scenario);
  const template = `${JSON.stringify(armContract(scenario), null, 2)}\n`;
  const parameters = `${JSON.stringify(armParameters(scenario), null, 2)}\n`;

  await Promise.all([
    writeFile(path.join(bundleDir, "Pulumi.yaml"), pulumiYaml()),
    writeFile(path.join(bundleDir, "package.json"), packageJson()),
    writeFile(path.join(bundleDir, "tsconfig.json"), tsconfigJson()),
    writeFile(path.join(bundleDir, "bin", "tap.ts"), entrypoint(scenario.expectedOutputKeys)),
    writeFile(path.join(bundleDir, "lib", "PROMPT.md"), `${scenario.prompt}\n`),
    writeFile(path.join(bundleDir, "lib", "tap-stack.ts"), tapStackText),
    writeFile(path.join(bundleDir, "test", "tap-stack.unit.test.mjs"), unitTest()),
    writeFile(path.join(bundleDir, "test", "tap-stack.int.test.mjs"), integrationTest()),
    writeFile(path.join(bundleDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`),
    writeFile(path.join(bundleDir, "globalstack", "azuredeploy.json"), template),
    writeFile(path.join(bundleDir, "globalstack", "azuredeploy.parameters.json"), parameters),
    writeFile(path.join(runtimeDir, "globalstack", "azuredeploy.json"), template),
    writeFile(path.join(runtimeDir, "globalstack", "azuredeploy.parameters.json"), parameters),
  ]);

  return bundleDir;
}

function shipmentDirFor(scenario) {
  return path.join(verificationRoot, ".lifecycle-work", "shipments", scenario.poId, `${scenario.prId}_unzipped`);
}

async function exportShipment(scenario) {
  const code = await run("node", ["packages/bundle-runtime/src/export-azure-shipment-bundle.mjs", `--po-id=${scenario.poId}`, `--pr-id=${scenario.prId}`], {
    cwd: root,
    stdio: "inherit",
  });
  if (code !== 0) {
    throw new Error(`shipment export failed for ${scenario.prId}`);
  }
  return shipmentDirFor(scenario);
}

async function runShipment(shipmentDir) {
  const result = await runCapture("bash", ["./run.sh"], {
    cwd: shipmentDir,
    env: {
      ...process.env,
      GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? "globalstack-local-token",
    },
  });
  const reportPath = path.join(shipmentDir, "execution-report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  let failingStage = null;
  let failingMessage = null;
  const reportsDir = path.join(shipmentDir, "docker", "reports");
  const nativeStdoutPath = path.join(reportsDir, "native-stdout.log");
  const nativeStderrPath = path.join(reportsDir, "native-stderr.log");
  for (const stage of ["build", "lint", "unit-tests", "deploy", "provider-lifecycle", "integration-tests", "destroy"]) {
    const stagePath = path.join(reportsDir, `stage-${stage}.json`);
    try {
      const stageReport = JSON.parse(await readFile(stagePath, "utf8"));
      if (stageReport.status !== "PASS" && !failingStage) {
        failingStage = stage;
        failingMessage = stageReport.message ?? null;
      }
    } catch {
      // ignore missing stage reports
    }
  }
  const nativeStdout = await readFile(nativeStdoutPath, "utf8").catch(() => "");
  const nativeStderr = await readFile(nativeStderrPath, "utf8").catch(() => "");
  return {
    exitCode: result.code,
    report,
    failingStage,
    failingMessage,
    nativeStdout,
    nativeStderr,
    executionLogPath: path.join(shipmentDir, "execution.log"),
    executionReportPath: reportPath,
  };
}

function shouldRepairRun(runResult) {
  const evidence = `${runResult.failingMessage ?? ""}\n${runResult.nativeStdout ?? ""}\n${runResult.nativeStderr ?? ""}`;
  return /(Unable to compile TypeScript|TSError|error TS\d+|Cannot find module|Property '.+' does not exist on type|No overload matches this call|is not assignable to type|Missing required configuration variable)/i.test(evidence);
}

function repairEvidence(runResult) {
  const evidence = `${runResult.failingMessage ?? ""}\n${runResult.nativeStdout ?? ""}\n${runResult.nativeStderr ?? ""}`.trim();
  if (evidence.length <= 4000) {
    return evidence;
  }
  return evidence.slice(-4000);
}

async function main() {
  const results = [];
  for (const scenario of selectedScenarios()) {
    console.log(`\n=== Generating ${scenario.prId} (${scenario.scenarioId}) with ${model} ===`);
    let prompt = scenario.prompt;
    let bundleDir = null;
    let shipmentDir = shipmentDirFor(scenario);
    let runResult = null;
    let tapStackText = "";

    for (let runtimeAttempt = 1; runtimeAttempt <= 3; runtimeAttempt += 1) {
      if (runtimeAttempt > 1) {
        console.log(`repairing ${scenario.prId} after runtime feedback (${runtimeAttempt}/3)`);
      }
      tapStackText = await generateTapStack({ ...scenario, prompt });
      bundleDir = await writeBundle(scenario, tapStackText);
      shipmentDir = await exportShipment(scenario);
      if (!runEnabled) {
        break;
      }
      console.log(`\n=== Running shipment ${scenario.prId} ===`);
      runResult = await runShipment(shipmentDir);
      if (runResult.report.overall_status === "PASS" || !shouldRepairRun(runResult) || runtimeAttempt === 3) {
        break;
      }
      prompt = runtimeRepairPrompt(scenario, scenario.prompt, repairEvidence(runResult), tapStackText);
    }
    results.push({
      poId: scenario.poId,
      prId: scenario.prId,
      scenarioId: scenario.scenarioId,
      bundleDir,
      shipmentDir,
      run: runResult,
    });
  }

  const summaryPath = path.join(distPath(root, "complex-pulumi-bundles"), "latest-results.json");
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify({ model, generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`\nWrote summary to ${summaryPath}`);
}

await main();
