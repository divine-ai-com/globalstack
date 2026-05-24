import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { distPath, verificationRepoRoot, verifiedWorkspacePath, workspaceRoot } from "../../workspace-utils/src/index.mjs";
import { ultraExpertWave91046to91050 } from "./complex-pulumi-scenarios-wave-91046-91050.mjs";
import { ultraExpertWave91051to91055 } from "./complex-pulumi-scenarios-wave-91051-91055.mjs";
import { ultraExpertWave91056to91060 } from "./complex-pulumi-scenarios-wave-91056-91060.mjs";
import { ultraExpertWave91061to91065 } from "./complex-pulumi-scenarios-wave-91061-91065.mjs";
import { ultraExpertWave91066to91070 } from "./complex-pulumi-scenarios-wave-91066-91070.mjs";
import { ultraExpertWave91071to91075 } from "./complex-pulumi-scenarios-wave-91071-91075.mjs";
import { ultraExpertWave91076to91080 } from "./complex-pulumi-scenarios-wave-91076-91080.mjs";
import { ultraExpertWave91081to91085 } from "./complex-pulumi-scenarios-wave-91081-91085.mjs";
import { ultraExpertWave91086to91090 } from "./complex-pulumi-scenarios-wave-91086-91090.mjs";
import { ultraExpertWave91091to91095 } from "./complex-pulumi-scenarios-wave-91091-91095.mjs";
import { ultraExpertWave91096to91100 } from "./complex-pulumi-scenarios-wave-91096-91100.mjs";
import { ultraExpertWave91101to91105 } from "./complex-pulumi-scenarios-wave-91101-91105.mjs";

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

export const scenarios = [
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
  {
    poId: "a80e62d2-4e2f-48d8-82f4-ca1423d047cf",
    prId: "Pr91018",
    scenarioId: "multiregion-aks-serving-fabric",
    title: "Multi-region AKS serving fabric",
    prompt: [
      "Our platform reliability team wants one Azure deployment for an active/active model-serving fabric that can keep running through a regional outage. They need a shared image registry, one AKS cluster in `eastus`, one AKS cluster in `westus2`, one global HTTP edge, regional ingress surfaces in both regions, a durable rollout command lane, release notifications, and the normal secret, configuration, and telemetry stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript.",
      "",
      "Use Azure Container Registry for images, two AKS clusters, one Azure Front Door profile with one endpoint and one security policy, one WAF policy protecting that Front Door surface, one Application Gateway per region, one virtual network and one gateway subnet per region, a Service Bus topic with one `east` subscription and one `west` subscription for rollout commands, one Event Grid topic for release notifications, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-multiregion-aks-pulumi-91018`, registry `acrmregionaks91018`, AKS cluster `aks-inference-east-91018`, AKS cluster `aks-inference-west-91018`, Front Door profile `afd-inference-91018`, Front Door endpoint `inference-global-endpoint`, Front Door security policy `inference-edge-security-policy`, WAF policy `waf-inference-91018`, virtual network `vnet-inference-east-91018`, virtual network `vnet-inference-west-91018`, gateway subnet `snet-agw-east-91018`, gateway subnet `snet-agw-west-91018`, Application Gateway `agw-inference-east-91018`, Application Gateway `agw-inference-west-91018`, Service Bus namespace `sb-inference-91018`, Service Bus topic `rollout-commands`, Service Bus subscription `east`, Service Bus subscription `west`, Event Grid topic `eg-inference-91018`, Key Vault `kv-inference-91018`, App Configuration store `cfg-inference-91018`, Log Analytics workspace `log-inference-91018`, and Application Insights component `appi-inference-91018`.",
      "",
      "Keep this focused on the rollout fabric itself. Do not add Cosmos DB, PostgreSQL, MySQL, Logic Apps, private endpoints, or custom domains. Front Door is the only public edge in this task; the regional Application Gateways and clusters are part of the regional serving fabric.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `InferenceRegistryName`, `InferenceEastClusterName`, `InferenceWestClusterName`, `InferenceFrontDoorProfileName`, `InferenceFrontDoorEndpointHostName`, `InferenceEastApplicationGatewayName`, `InferenceWestApplicationGatewayName`, `InferenceServiceBusTopicName`, `InferenceEastSubscriptionName`, `InferenceWestSubscriptionName`, `InferenceEventGridTopicEndpoint`, `InferenceKeyVaultName`, `InferenceAppConfigName`, `InferenceAppInsightsName`, `InferenceLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "AKS baseline for multi-region clusters",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
        why: "Grounds the active/active regional AKS and global edge pattern.",
      },
      {
        title: "Baseline architecture for an AKS cluster",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks/baseline-aks",
        why: "Grounds the shared platform controls around AKS, Key Vault, and Log Analytics.",
      },
      {
        title: "Azure Application Gateway overview",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/overview",
        why: "Grounds the regional ingress tier that sits in front of each cluster.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-multiregion-aks-pulumi-91018",
      registry: "acrmregionaks91018",
      eastCluster: "aks-inference-east-91018",
      westCluster: "aks-inference-west-91018",
      frontDoorProfile: "afd-inference-91018",
      frontDoorEndpoint: "inference-global-endpoint",
      frontDoorSecurityPolicy: "inference-edge-security-policy",
      wafPolicy: "waf-inference-91018",
      eastVirtualNetwork: "vnet-inference-east-91018",
      westVirtualNetwork: "vnet-inference-west-91018",
      eastGatewaySubnet: "snet-agw-east-91018",
      westGatewaySubnet: "snet-agw-west-91018",
      eastApplicationGateway: "agw-inference-east-91018",
      westApplicationGateway: "agw-inference-west-91018",
      serviceBusNamespace: "sb-inference-91018",
      serviceBusTopic: "rollout-commands",
      eastSubscription: "east",
      westSubscription: "west",
      eventGridTopic: "eg-inference-91018",
      keyVault: "kv-inference-91018",
      appConfigStore: "cfg-inference-91018",
      logAnalyticsWorkspace: "log-inference-91018",
      applicationInsights: "appi-inference-91018",
    },
    expectedOutputKeys: [
      "InferenceRegistryName",
      "InferenceEastClusterName",
      "InferenceWestClusterName",
      "InferenceFrontDoorProfileName",
      "InferenceFrontDoorEndpointHostName",
      "InferenceEastApplicationGatewayName",
      "InferenceWestApplicationGatewayName",
      "InferenceServiceBusTopicName",
      "InferenceEastSubscriptionName",
      "InferenceWestSubscriptionName",
      "InferenceEventGridTopicEndpoint",
      "InferenceKeyVaultName",
      "InferenceAppConfigName",
      "InferenceAppInsightsName",
      "InferenceLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "containerregistry.",
      "containerservice.",
      "cdn.",
      "network.ApplicationGateway",
      "servicebus.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "aks-inference-east-91018",
      "aks-inference-west-91018",
      "rollout-commands",
      "waf-inference-91018",
    ],
    forbiddenSourceMarkers: ["documentdb", "dbforpostgresql", "dbformysql", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrmregionaks91018", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "aks-east", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-inference-east-91018", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "aks-west", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-inference-west-91018", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-inference-91018", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-inference-91018/afdEndpoints/inference-global-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-inference-91018/securityPolicies/inference-edge-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-inference-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-inference-east-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-inference-west-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-gateway-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-inference-east-91018/subnets/snet-agw-east-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-gateway-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-inference-west-91018/subnets/snet-agw-west-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-app-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-inference-east-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "west-app-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-inference-west-91018", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-inference-91018", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-inference-91018/topics/rollout-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-inference-91018/topics/rollout-commands/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-inference-91018/topics/rollout-commands/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-inference-91018", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-inference-91018", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-inference-91018", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-inference-91018", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-inference-91018", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "60b4b794-0627-46b9-bda7-cc1f5905290f",
    prId: "Pr91019",
    scenarioId: "streaming-warehouse-command-center",
    title: "Streaming warehouse command center",
    prompt: [
      "Our warehouse operations group wants one Azure deployment for a streaming command center that can absorb live operational events, keep batch evidence, and expose a warehouse analytics plane without stitching services together later. They need an event ingress tier, a serverless processing surface, one Synapse workspace with a dedicated SQL pool, one durable alerting lane, raw and staged storage, and the usual secret, configuration, and telemetry stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Event Hubs namespace with one event hub for the live operations stream, one Function App as the processing surface, one storage account with one blob container and one Azure Files share, one Synapse workspace with one SQL pool, one Service Bus topic with one `ops` subscription and one `finance` subscription for warehouse alerts, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-warehouse-stream-pulumi-91019`, storage account `azwarehouseops91019`, blob container `bronze-data`, file share `batch-drop`, Event Hubs namespace `eh-warehouse-91019`, Event Hub `operations-stream`, Function App plan `plan-warehouse-91019`, Function App `func-warehouse-91019`, Synapse workspace `syn-warehouse-91019`, Synapse SQL pool `warehousepool`, Service Bus namespace `sb-warehouse-91019`, Service Bus topic `warehouse-alerts`, Service Bus subscription `ops`, Service Bus subscription `finance`, Key Vault `kv-warehouse-91019`, App Configuration store `cfg-warehouse-91019`, Log Analytics workspace `log-warehouse-91019`, and Application Insights component `appi-warehouse-91019`.",
      "",
      "Keep the storage account private and HTTPS-only. Keep the blob container and file share private. Do not add API Management, AKS, Front Door, Cosmos DB, PostgreSQL, MySQL, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `WarehouseStorageAccountName`, `WarehouseBlobContainerName`, `WarehouseFileShareName`, `WarehouseEventHubNamespaceName`, `WarehouseEventHubName`, `WarehouseFunctionHostName`, `WarehouseSynapseWorkspaceName`, `WarehouseSqlPoolName`, `WarehouseServiceBusTopicName`, `WarehouseOpsSubscriptionName`, `WarehouseFinanceSubscriptionName`, `WarehouseKeyVaultName`, `WarehouseAppConfigName`, `WarehouseAppInsightsName`, `WarehouseLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Integrate Event Hubs with serverless functions on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/serverless/event-hubs-functions/event-hubs-functions",
        why: "Grounds the Event Hubs plus Azure Functions processing surface.",
      },
      {
        title: "What is Azure Synapse Analytics?",
        url: "https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is",
        why: "Grounds the warehouse analytics workspace and dedicated SQL pool layer.",
      },
      {
        title: "Use Azure Files with Azure Kubernetes Service and containerized workloads",
        url: "https://learn.microsoft.com/en-us/azure/storage/files/storage-files-introduction",
        why: "Grounds the use of Azure Files as the staged batch handoff surface.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-warehouse-stream-pulumi-91019",
      storageAccount: "azwarehouseops91019",
      blobContainer: "bronze-data",
      fileShare: "batch-drop",
      eventHubNamespace: "eh-warehouse-91019",
      eventHub: "operations-stream",
      functionAppPlan: "plan-warehouse-91019",
      functionApp: "func-warehouse-91019",
      synapseWorkspace: "syn-warehouse-91019",
      synapseSqlPool: "warehousepool",
      serviceBusNamespace: "sb-warehouse-91019",
      serviceBusTopic: "warehouse-alerts",
      opsSubscription: "ops",
      financeSubscription: "finance",
      keyVault: "kv-warehouse-91019",
      appConfigStore: "cfg-warehouse-91019",
      logAnalyticsWorkspace: "log-warehouse-91019",
      applicationInsights: "appi-warehouse-91019",
    },
    expectedOutputKeys: [
      "WarehouseStorageAccountName",
      "WarehouseBlobContainerName",
      "WarehouseFileShareName",
      "WarehouseEventHubNamespaceName",
      "WarehouseEventHubName",
      "WarehouseFunctionHostName",
      "WarehouseSynapseWorkspaceName",
      "WarehouseSqlPoolName",
      "WarehouseServiceBusTopicName",
      "WarehouseOpsSubscriptionName",
      "WarehouseFinanceSubscriptionName",
      "WarehouseKeyVaultName",
      "WarehouseAppConfigName",
      "WarehouseAppInsightsName",
      "WarehouseLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "eventhub.",
      "web.",
      "synapse.",
      "servicebus.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "operations-stream",
      "warehouse-alerts",
      "warehousepool",
      "batch-drop",
    ],
    forbiddenSourceMarkers: ["apimanagement", "containerservice", "documentdb", "dbformysql", "dbforpostgresql", "frontdoor", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azwarehouseops91019", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azwarehouseops91019/blobServices/default/containers/bronze-data", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azwarehouseops91019/fileServices/default/shares/batch-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-warehouse-91019", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-warehouse-91019/eventhubs/operations-stream", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-warehouse-91019", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-warehouse-91019", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "synapse-workspace", provider: "Microsoft.Synapse", typePath: "workspaces/syn-warehouse-91019", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces" },
      { label: "synapse-sql-pool", provider: "Microsoft.Synapse", typePath: "workspaces/syn-warehouse-91019/sqlPools/warehousepool", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces/sqlPools" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91019", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91019/topics/warehouse-alerts", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-ops", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91019/topics/warehouse-alerts/subscriptions/ops", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-finance", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91019/topics/warehouse-alerts/subscriptions/finance", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-warehouse-91019", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-warehouse-91019", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-warehouse-91019", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-warehouse-91019", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "a14946b6-1dea-4b78-8b2c-1d2d0ab4a355",
    prId: "Pr91020",
    scenarioId: "partner-fulfillment-control-plane",
    title: "Partner fulfillment control plane",
    prompt: [
      "Our partner operations team wants one Azure deployment for a fulfillment control plane that can accept partner orders, fan them out into durable internal workflows, keep manifest files, and maintain a transactional fulfillment store without bolting services together later. They need one public intake surface, one serverless processing surface, one long-running workflow surface, one pub/sub backbone, one private database, one evidence store, and the normal secret, configuration, and telemetry stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure API Management in front of the partner-facing API, one Function App for synchronous intake work, one Logic App workflow for long-running fulfillment coordination, one Service Bus topic with one `warehouse` subscription and one `billing` subscription, one Event Grid topic for downstream notifications, one storage account with one blob container and one Azure Files share, one MySQL flexible server with one database, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-partner-fulfillment-pulumi-91020`, storage account `azpartnerful91020`, blob container `partner-attachments`, file share `partner-manifests`, API Management service `apim-partner-fulfillment-91020`, API Management API `partner-fulfillment-api`, API Management product `partner-fulfillment-product`, Function App plan `plan-partner-fulfillment-91020`, Function App `func-partner-fulfillment-91020`, Logic App workflow `la-partner-fulfillment-91020`, Service Bus namespace `sb-partner-fulfillment-91020`, Service Bus topic `partner-orders`, Service Bus subscription `warehouse`, Service Bus subscription `billing`, Event Grid topic `eg-partner-fulfillment-91020`, MySQL server `mysql-partner-fulfillment-91020`, MySQL database `fulfillmentdb`, Key Vault `kv-partner-ful-91020`, App Configuration store `cfg-partner-fulfillment-91020`, Log Analytics workspace `log-partner-fulfillment-91020`, and Application Insights component `appi-partner-fulfillment-91020`.",
      "",
      "API Management is the only public entry point in this task. Keep the storage account private and HTTPS-only, keep the blob container and file share private, and keep the database internal. Do not add AKS, Front Door, Cosmos DB, PostgreSQL, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `PartnerFulfillmentApiGatewayUrl`, `PartnerFulfillmentFunctionHostName`, `PartnerFulfillmentWorkflowName`, `PartnerFulfillmentStorageAccountName`, `PartnerFulfillmentBlobContainerName`, `PartnerFulfillmentFileShareName`, `PartnerFulfillmentTopicName`, `PartnerFulfillmentWarehouseSubscriptionName`, `PartnerFulfillmentBillingSubscriptionName`, `PartnerFulfillmentMySqlServerName`, `PartnerFulfillmentDatabaseName`, `PartnerFulfillmentKeyVaultName`, `PartnerFulfillmentAppConfigName`, `PartnerFulfillmentAppInsightsName`, `PartnerFulfillmentLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Basic enterprise integration on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/enterprise-integration/basic-enterprise-integration",
        why: "Grounds API Management plus workflow orchestration for partner-facing integrations.",
      },
      {
        title: "Respond to Azure Service Bus events received using Azure Event Grid by using Azure Logic Apps",
        url: "https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-to-event-grid-integration-example",
        why: "Grounds the Service Bus, Event Grid, and Logic Apps control-plane wiring.",
      },
      {
        title: "Azure Database for MySQL - Flexible Server documentation",
        url: "https://learn.microsoft.com/en-us/azure/mysql/flexible-server/overview",
        why: "Grounds the managed MySQL transactional store in the fulfillment fabric.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-partner-fulfillment-pulumi-91020",
      storageAccount: "azpartnerful91020",
      blobContainer: "partner-attachments",
      fileShare: "partner-manifests",
      apiManagementService: "apim-partner-fulfillment-91020",
      apiManagementApi: "partner-fulfillment-api",
      apiManagementProduct: "partner-fulfillment-product",
      functionAppPlan: "plan-partner-fulfillment-91020",
      functionApp: "func-partner-fulfillment-91020",
      logicWorkflow: "la-partner-fulfillment-91020",
      serviceBusNamespace: "sb-partner-fulfillment-91020",
      serviceBusTopic: "partner-orders",
      warehouseSubscription: "warehouse",
      billingSubscription: "billing",
      eventGridTopic: "eg-partner-fulfillment-91020",
      mysqlServer: "mysql-partner-fulfillment-91020",
      mysqlDatabase: "fulfillmentdb",
      keyVault: "kv-partner-ful-91020",
      appConfigStore: "cfg-partner-fulfillment-91020",
      logAnalyticsWorkspace: "log-partner-fulfillment-91020",
      applicationInsights: "appi-partner-fulfillment-91020",
    },
    expectedOutputKeys: [
      "PartnerFulfillmentApiGatewayUrl",
      "PartnerFulfillmentFunctionHostName",
      "PartnerFulfillmentWorkflowName",
      "PartnerFulfillmentStorageAccountName",
      "PartnerFulfillmentBlobContainerName",
      "PartnerFulfillmentFileShareName",
      "PartnerFulfillmentTopicName",
      "PartnerFulfillmentWarehouseSubscriptionName",
      "PartnerFulfillmentBillingSubscriptionName",
      "PartnerFulfillmentMySqlServerName",
      "PartnerFulfillmentDatabaseName",
      "PartnerFulfillmentKeyVaultName",
      "PartnerFulfillmentAppConfigName",
      "PartnerFulfillmentAppInsightsName",
      "PartnerFulfillmentLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement",
      "web.",
      "logic.",
      "servicebus.",
      "eventgrid.",
      "storage.",
      "dbformysql.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "partner-orders",
      "partner-manifests",
      "fulfillmentdb",
    ],
    forbiddenSourceMarkers: ["containerservice", "frontdoor", "documentdb", "dbforpostgresql", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartnerful91020", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartnerful91020/blobServices/default/containers/partner-attachments", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartnerful91020/fileServices/default/shares/partner-manifests", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-fulfillment-91020", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-fulfillment-91020/apis/partner-fulfillment-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-fulfillment-91020/products/partner-fulfillment-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-partner-fulfillment-91020", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-partner-fulfillment-91020", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-partner-fulfillment-91020", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-partner-fulfillment-91020", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-partner-fulfillment-91020/topics/partner-orders", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-warehouse", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-partner-fulfillment-91020/topics/partner-orders/subscriptions/warehouse", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-billing", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-partner-fulfillment-91020/topics/partner-orders/subscriptions/billing", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-partner-fulfillment-91020", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-partner-fulfillment-91020", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-partner-fulfillment-91020/databases/fulfillmentdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-partner-ful-91020", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-partner-fulfillment-91020", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-partner-fulfillment-91020", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-partner-fulfillment-91020", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "a9145353-43d4-4653-8a23-ba707e2402c4",
    prId: "Pr91021",
    scenarioId: "multiregion-private-discovery-mesh",
    title: "Multi-region private discovery mesh",
    prompt: [
      "Our internal platform networking team wants one Azure deployment for a private service-discovery mesh stretched across two regions. They need one private DNS namespace shared across east and west virtual networks, one internal routing surface per region, one internal application environment per region, durable dispatch channels for east and west workers, fast shared session state, and the normal secret, configuration, and telemetry stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript.",
      "",
      "Use one virtual network in `eastus`, one virtual network in `westus2`, one shared Azure Private DNS zone linked to both virtual networks, one internal Application Gateway per region, one Azure Container Apps managed environment per region with one internal container app per region, one Service Bus topic with one `east-dispatch` subscription and one `west-dispatch` subscription, one Azure Cache for Redis, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-private-mesh-pulumi-91021`, virtual network `vnet-mesh-east-91021`, virtual network `vnet-mesh-west-91021`, gateway subnet `snet-mesh-east-91021`, gateway subnet `snet-mesh-west-91021`, private DNS zone `mesh.internal`, private DNS virtual network link `mesh-link-east-91021`, private DNS virtual network link `mesh-link-west-91021`, Application Gateway `agw-mesh-east-91021`, Application Gateway `agw-mesh-west-91021`, Container Apps environment `cae-mesh-east-91021`, Container Apps environment `cae-mesh-west-91021`, Container App `ca-router-east-91021`, Container App `ca-router-west-91021`, Service Bus namespace `sb-mesh-91021`, Service Bus topic `mesh-dispatch`, Service Bus subscription `east-dispatch`, Service Bus subscription `west-dispatch`, Redis cache `redis-mesh-91021`, Key Vault `kv-mesh-91021`, App Configuration store `cfg-mesh-91021`, Log Analytics workspace `log-mesh-91021`, and Application Insights component `appi-mesh-91021`.",
      "",
      "Keep everything private and internal-only. Do not add Front Door, API Management, AKS, Cosmos DB, MySQL, PostgreSQL, private endpoints, or custom domains. The private DNS zone, the regional application gateways, and the regional container app environments are the core of this task.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `PrivateMeshEastVirtualNetworkName`, `PrivateMeshWestVirtualNetworkName`, `PrivateMeshPrivateDnsZoneName`, `PrivateMeshEastApplicationGatewayName`, `PrivateMeshWestApplicationGatewayName`, `PrivateMeshEastEnvironmentName`, `PrivateMeshWestEnvironmentName`, `PrivateMeshEastAppName`, `PrivateMeshWestAppName`, `PrivateMeshServiceBusTopicName`, `PrivateMeshEastSubscriptionName`, `PrivateMeshWestSubscriptionName`, `PrivateMeshRedisName`, `PrivateMeshKeyVaultName`, `PrivateMeshAppConfigName`, `PrivateMeshAppInsightsName`, `PrivateMeshLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Private DNS documentation",
        url: "https://learn.microsoft.com/en-us/azure/dns/private-dns-overview",
        why: "Grounds the shared private DNS namespace across linked virtual networks.",
      },
      {
        title: "Communicate between container apps in Azure Container Apps",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/connect-apps",
        why: "Grounds the internal-only regional application environments.",
      },
      {
        title: "Azure Application Gateway overview",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/overview",
        why: "Grounds the internal regional routing tier.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-private-mesh-pulumi-91021",
      eastVirtualNetwork: "vnet-mesh-east-91021",
      westVirtualNetwork: "vnet-mesh-west-91021",
      eastGatewaySubnet: "snet-mesh-east-91021",
      westGatewaySubnet: "snet-mesh-west-91021",
      privateDnsZone: "mesh.internal",
      eastDnsLink: "mesh-link-east-91021",
      westDnsLink: "mesh-link-west-91021",
      eastApplicationGateway: "agw-mesh-east-91021",
      westApplicationGateway: "agw-mesh-west-91021",
      eastEnvironment: "cae-mesh-east-91021",
      westEnvironment: "cae-mesh-west-91021",
      eastApp: "ca-router-east-91021",
      westApp: "ca-router-west-91021",
      serviceBusNamespace: "sb-mesh-91021",
      serviceBusTopic: "mesh-dispatch",
      eastSubscription: "east-dispatch",
      westSubscription: "west-dispatch",
      redisCache: "redis-mesh-91021",
      keyVault: "kv-mesh-91021",
      appConfigStore: "cfg-mesh-91021",
      logAnalyticsWorkspace: "log-mesh-91021",
      applicationInsights: "appi-mesh-91021",
    },
    expectedOutputKeys: [
      "PrivateMeshEastVirtualNetworkName",
      "PrivateMeshWestVirtualNetworkName",
      "PrivateMeshPrivateDnsZoneName",
      "PrivateMeshEastApplicationGatewayName",
      "PrivateMeshWestApplicationGatewayName",
      "PrivateMeshEastEnvironmentName",
      "PrivateMeshWestEnvironmentName",
      "PrivateMeshEastAppName",
      "PrivateMeshWestAppName",
      "PrivateMeshServiceBusTopicName",
      "PrivateMeshEastSubscriptionName",
      "PrivateMeshWestSubscriptionName",
      "PrivateMeshRedisName",
      "PrivateMeshKeyVaultName",
      "PrivateMeshAppConfigName",
      "PrivateMeshAppInsightsName",
      "PrivateMeshLogAnalyticsWorkspaceName",
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
      "PrivateZone",
      "PrivateRecordSet",
      "mesh.internal",
      "mesh-dispatch",
      "ca-router-east-91021",
      "ca-router-west-91021",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbforpostgresql", "dbformysql", "private endpoint"],
    integrationChecks: [
      { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-mesh-east-91021", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-mesh-west-91021", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-gateway-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-mesh-east-91021/subnets/snet-mesh-east-91021", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-gateway-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-mesh-west-91021/subnets/snet-mesh-west-91021", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/mesh.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
      { label: "private-dns-link-east", provider: "Microsoft.Network", typePath: "privateDnsZones/mesh.internal/virtualNetworkLinks/mesh-link-east-91021", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "private-dns-link-west", provider: "Microsoft.Network", typePath: "privateDnsZones/mesh.internal/virtualNetworkLinks/mesh-link-west-91021", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "east-app-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-mesh-east-91021", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "west-app-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-mesh-west-91021", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "east-managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-mesh-east-91021", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "west-managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-mesh-west-91021", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "east-app", provider: "Microsoft.App", typePath: "containerApps/ca-router-east-91021", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "west-app", provider: "Microsoft.App", typePath: "containerApps/ca-router-west-91021", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-mesh-91021", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-mesh-91021/topics/mesh-dispatch", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-mesh-91021/topics/mesh-dispatch/subscriptions/east-dispatch", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-mesh-91021/topics/mesh-dispatch/subscriptions/west-dispatch", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-mesh-91021", apiVersion: "2024-03-01", expectedType: "Microsoft.Cache/redis" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-mesh-91021", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-mesh-91021", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-mesh-91021", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-mesh-91021", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "ac12bef0-5855-4d92-af96-f1ae5046ed46",
    prId: "Pr91022",
    scenarioId: "modernization-cutover-observability-fabric",
    title: "Modernization cutover observability fabric",
    prompt: [
      "Our data modernization office wants one Azure deployment for a cutover and observability fabric that can coordinate a migration wave, keep evidence, track migration telemetry, and leave both the target transactional store and the post-cutover audit store in place. They need a managed migration surface, one target MySQL store, one PostgreSQL audit store, one telemetry stream, one durable command queue, staged file and blob evidence, and the usual secret, configuration, and telemetry stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use Azure Database Migration Service with one project, one MySQL flexible server with one database as the target store, one PostgreSQL flexible server with one database as the audit store, one Event Hubs namespace with one event hub for migration telemetry, one Service Bus queue for migration commands, one storage account with one blob container and one Azure Files share for evidence, one Logic App workflow for cutover orchestration, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-modernization-pulumi-91022`, storage account `azmodernize91022`, blob container `migration-snapshots`, file share `cutover-evidence`, Event Hubs namespace `eh-modernization-91022`, Event Hub `migration-telemetry`, Service Bus namespace `sb-modernization-91022`, Service Bus queue `migration-commands`, Logic App workflow `la-modernization-91022`, Database Migration Service `dms-modernization-91022`, Database Migration project `mysql-cutover-wave`, MySQL server `mysql-modernization-91022`, MySQL database `appdb`, PostgreSQL flexible server `pg-modernization-91022`, PostgreSQL database `auditdb`, Key Vault `kv-modernization-91022`, App Configuration store `cfg-modernization-91022`, Log Analytics workspace `log-modernization-91022`, and Application Insights component `appi-modernization-91022`.",
      "",
      "Keep the storage account private and HTTPS-only. Keep the blob container and file share private. Do not add AKS, Front Door, API Management, Cosmos DB, private endpoints, or custom domains.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ModernizationStorageAccountName`, `ModernizationBlobContainerName`, `ModernizationFileShareName`, `ModernizationEventHubNamespaceName`, `ModernizationEventHubName`, `ModernizationServiceBusQueueName`, `ModernizationWorkflowName`, `ModernizationDmsServiceName`, `ModernizationDmsProjectName`, `ModernizationMySqlServerName`, `ModernizationMySqlDatabaseName`, `ModernizationPostgresServerName`, `ModernizationPostgresDatabaseName`, `ModernizationKeyVaultName`, `ModernizationAppConfigName`, `ModernizationAppInsightsName`, `ModernizationLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Database Migration Service documentation",
        url: "https://learn.microsoft.com/en-us/azure/dms/",
        why: "Grounds the managed migration surface and project model.",
      },
      {
        title: "Migration service in Azure Database for PostgreSQL",
        url: "https://learn.microsoft.com/en-us/azure/postgresql/migrate/migration-service/overview-migration-service-postgresql",
        why: "Grounds staged migration operations around PostgreSQL estates and migration waves.",
      },
      {
        title: "Integrate Event Hubs with serverless functions on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/serverless/event-hubs-functions/event-hubs-functions",
        why: "Grounds the telemetry stream and operational event-handling lane around the cutover fabric.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-modernization-pulumi-91022",
      storageAccount: "azmodernize91022",
      blobContainer: "migration-snapshots",
      fileShare: "cutover-evidence",
      eventHubNamespace: "eh-modernization-91022",
      eventHub: "migration-telemetry",
      serviceBusNamespace: "sb-modernization-91022",
      serviceBusQueue: "migration-commands",
      logicWorkflow: "la-modernization-91022",
      dmsService: "dms-modernization-91022",
      dmsProject: "mysql-cutover-wave",
      mysqlServer: "mysql-modernization-91022",
      mysqlDatabase: "appdb",
      postgresServer: "pg-modernization-91022",
      postgresDatabase: "auditdb",
      keyVault: "kv-modernization-91022",
      appConfigStore: "cfg-modernization-91022",
      logAnalyticsWorkspace: "log-modernization-91022",
      applicationInsights: "appi-modernization-91022",
    },
    expectedOutputKeys: [
      "ModernizationStorageAccountName",
      "ModernizationBlobContainerName",
      "ModernizationFileShareName",
      "ModernizationEventHubNamespaceName",
      "ModernizationEventHubName",
      "ModernizationServiceBusQueueName",
      "ModernizationWorkflowName",
      "ModernizationDmsServiceName",
      "ModernizationDmsProjectName",
      "ModernizationMySqlServerName",
      "ModernizationMySqlDatabaseName",
      "ModernizationPostgresServerName",
      "ModernizationPostgresDatabaseName",
      "ModernizationKeyVaultName",
      "ModernizationAppConfigName",
      "ModernizationAppInsightsName",
      "ModernizationLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "eventhub.",
      "servicebus.",
      "logic.",
      "datamigration.",
      "dbformysql.",
      "dbforpostgresql.",
      "storage.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "mysql-cutover-wave",
      "migration-telemetry",
      "cutover-evidence",
    ],
    forbiddenSourceMarkers: ["containerservice", "frontdoor", "apimanagement", "documentdb", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azmodernize91022", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azmodernize91022/blobServices/default/containers/migration-snapshots", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azmodernize91022/fileServices/default/shares/cutover-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-modernization-91022", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-modernization-91022/eventhubs/migration-telemetry", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-modernization-91022", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-modernization-91022/queues/migration-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-modernization-91022", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-modernization-91022", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
      { label: "dms-project", provider: "Microsoft.DataMigration", typePath: "services/dms-modernization-91022/projects/mysql-cutover-wave", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-modernization-91022", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-modernization-91022/databases/appdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-modernization-91022", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-modernization-91022/databases/auditdb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-modernization-91022", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-modernization-91022", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-modernization-91022", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-modernization-91022", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "b9e975a5-111a-40a1-bf05-d1b2f72cc812",
    prId: "Pr91023",
    scenarioId: "edge-incident-response-fabric",
    title: "Edge incident response fabric",
    prompt: [
      "Our edge operations team wants one Azure deployment for a global incident response fabric that can terminate traffic at one global edge, enforce edge security, queue operational commands, keep forensic evidence, and fan out notifications and alerts without hand-wiring the platform later. They need one global HTTP edge, one API facade for operations, one low-latency cache, one durable internal command lane, one evidence store, and one alerting plane tied into the same stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Azure Front Door profile with one endpoint and one security policy, one WAF policy protecting that Front Door surface, one API Management service with one API and one product, one Azure Cache for Redis, one Service Bus namespace with one queue for incident commands, one Event Grid topic for downstream notifications, one storage account with one blob container for evidence, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-edge-ops-pulumi-91023`, Front Door profile `afd-edge-command-91023`, Front Door endpoint `edge-command-endpoint`, Front Door security policy `edge-command-security-policy`, WAF policy `waf-edge-command-91023`, API Management service `apim-edge-command-91023`, API Management API `edge-command-api`, API Management product `edge-command-product`, Redis cache `redis-edge-command-91023`, Service Bus namespace `sb-edge-command-91023`, Service Bus queue `incident-commands`, Event Grid topic `eg-edge-command-91023`, storage account `azedgecmd91023`, blob container `incident-evidence`, action group `ag-edge-ops-91023`, metric alert `ma-edge-ops-91023`, activity log alert `ala-edge-ops-91023`, Key Vault `kv-edge-ops-91023`, App Configuration store `cfg-edge-ops-91023`, Log Analytics workspace `log-edge-ops-91023`, and Application Insights component `appi-edge-ops-91023`.",
      "",
      "Keep Front Door as the only public edge in this task. Keep the storage account private and HTTPS-only, keep the blob container private, and do not add AKS, Container Apps, Cosmos DB, MySQL, PostgreSQL, Logic Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `EdgeOpsFrontDoorProfileName`, `EdgeOpsFrontDoorEndpointHostName`, `EdgeOpsSecurityPolicyName`, `EdgeOpsApiGatewayUrl`, `EdgeOpsRedisName`, `EdgeOpsServiceBusQueueName`, `EdgeOpsEventGridTopicEndpoint`, `EdgeOpsStorageAccountName`, `EdgeOpsBlobContainerName`, `EdgeOpsActionGroupName`, `EdgeOpsMetricAlertName`, `EdgeOpsActivityLogAlertName`, `EdgeOpsKeyVaultName`, `EdgeOpsAppConfigName`, `EdgeOpsAppInsightsName`, `EdgeOpsLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Front Door overview",
        url: "https://learn.microsoft.com/en-us/azure/frontdoor/front-door-overview",
        why: "Grounds the global HTTP edge and security boundary.",
      },
      {
        title: "Create and manage action groups in Azure Monitor",
        url: "https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/action-groups",
        why: "Grounds the shared notification and automation surface for alerts.",
      },
      {
        title: "Create an activity log, service health, or resource health alert rule",
        url: "https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-create-activity-log-alert-rule?tabs=activity-log",
        why: "Grounds the control-plane alerting surface for incident response workflows.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-edge-ops-pulumi-91023",
      frontDoorProfile: "afd-edge-command-91023",
      frontDoorEndpoint: "edge-command-endpoint",
      frontDoorSecurityPolicy: "edge-command-security-policy",
      wafPolicy: "waf-edge-command-91023",
      apiManagementService: "apim-edge-command-91023",
      apiManagementApi: "edge-command-api",
      apiManagementProduct: "edge-command-product",
      redis: "redis-edge-command-91023",
      serviceBusNamespace: "sb-edge-command-91023",
      serviceBusQueue: "incident-commands",
      eventGridTopic: "eg-edge-command-91023",
      storageAccount: "azedgecmd91023",
      blobContainer: "incident-evidence",
      actionGroup: "ag-edge-ops-91023",
      metricAlert: "ma-edge-ops-91023",
      activityLogAlert: "ala-edge-ops-91023",
      keyVault: "kv-edge-ops-91023",
      appConfigStore: "cfg-edge-ops-91023",
      logAnalyticsWorkspace: "log-edge-ops-91023",
      applicationInsights: "appi-edge-ops-91023",
    },
    expectedOutputKeys: [
      "EdgeOpsFrontDoorProfileName",
      "EdgeOpsFrontDoorEndpointHostName",
      "EdgeOpsSecurityPolicyName",
      "EdgeOpsApiGatewayUrl",
      "EdgeOpsRedisName",
      "EdgeOpsServiceBusQueueName",
      "EdgeOpsEventGridTopicEndpoint",
      "EdgeOpsStorageAccountName",
      "EdgeOpsBlobContainerName",
      "EdgeOpsActionGroupName",
      "EdgeOpsMetricAlertName",
      "EdgeOpsActivityLogAlertName",
      "EdgeOpsKeyVaultName",
      "EdgeOpsAppConfigName",
      "EdgeOpsAppInsightsName",
      "EdgeOpsLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "cdn.",
      "apimanagement",
      "cache.Redis",
      "servicebus.Queue",
      "eventgrid.",
      "storage.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "insights.ActivityLogAlert",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "incident-commands",
      "incident-evidence",
    ],
    forbiddenSourceMarkers: ["containerservice", "containerapp", "documentdb", "dbforpostgresql", "dbformysql", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-edge-command-91023", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-edge-command-91023/afdEndpoints/edge-command-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-edge-command-91023/securityPolicies/edge-command-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-edge-command-91023", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-edge-command-91023", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-edge-command-91023/apis/edge-command-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-edge-command-91023/products/edge-command-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-edge-command-91023", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-edge-command-91023", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-edge-command-91023/queues/incident-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-edge-command-91023", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azedgecmd91023", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azedgecmd91023/blobServices/default/containers/incident-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-edge-ops-91023", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-edge-ops-91023", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-edge-ops-91023", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-edge-ops-91023", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-edge-ops-91023", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-edge-ops-91023", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-edge-ops-91023", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "26e29b6c-3806-4c2d-aa91-d16501bb98e4",
    prId: "Pr91024",
    scenarioId: "connected-factory-twin-command-mesh",
    title: "Connected factory twin command mesh",
    prompt: [
      "Our factory platform team wants one Azure deployment for a connected operations mesh that can accept device telemetry, project it into a digital twin layer, persist operational state, issue commands back into the plant, and keep a long-lived archive for forensic work. They need the telemetry ingress, the twin graph, a serverless processing surface, a hot operational store, a durable command lane, and the usual secret, configuration, and telemetry services all inside one stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one storage account with one blob container for telemetry archive, one IoT Hub, one Event Hubs namespace with one event hub, one Function App for processing, one Cosmos DB account with one SQL database and one SQL container for operational state, one Azure Digital Twins instance, one Service Bus namespace with one queue for twin commands, one Event Grid topic for downstream notifications, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-factory-twins-pulumi-91024`, storage account `aztwinops91024`, blob container `telemetry-archive`, IoT Hub `iot-twins-91024`, Event Hubs namespace `eh-twins-91024`, Event Hub `twin-telemetry`, Function App plan `plan-twins-91024`, Function App `func-twins-91024`, Cosmos DB account `cosmos-twins-91024`, Cosmos SQL database `TwinStateDb`, Cosmos SQL container `TwinState`, Digital Twins instance `adt-twins-91024`, Service Bus namespace `sb-twins-91024`, Service Bus queue `twin-commands`, Event Grid topic `eg-twins-91024`, Key Vault `kv-twins-91024`, App Configuration store `cfg-twins-91024`, Log Analytics workspace `log-twins-91024`, and Application Insights component `appi-twins-91024`.",
      "",
      "Keep this focused on the factory control mesh. Do not add API Management, AKS, Front Door, MySQL, PostgreSQL, Logic Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `TwinOpsStorageAccountName`, `TwinOpsArchiveContainerName`, `TwinOpsIotHubName`, `TwinOpsEventHubNamespaceName`, `TwinOpsEventHubName`, `TwinOpsFunctionHostName`, `TwinOpsCosmosAccountName`, `TwinOpsCosmosDatabaseName`, `TwinOpsCosmosContainerName`, `TwinOpsDigitalTwinsName`, `TwinOpsServiceBusQueueName`, `TwinOpsEventGridTopicEndpoint`, `TwinOpsKeyVaultName`, `TwinOpsAppConfigName`, `TwinOpsAppInsightsName`, `TwinOpsLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "What is Azure Digital Twins?",
        url: "https://learn.microsoft.com/en-us/azure/digital-twins/overview",
        why: "Grounds the digital twin graph as the domain model for the factory environment.",
      },
      {
        title: "Route Azure Digital Twins events",
        url: "https://learn.microsoft.com/en-us/azure/digital-twins/concepts-route-events",
        why: "Grounds the twin event routing patterns into downstream event services.",
      },
      {
        title: "Ingest telemetry from IoT Hub into Azure Digital Twins",
        url: "https://learn.microsoft.com/en-us/azure/digital-twins/how-to-ingest-iot-hub-data",
        why: "Grounds the IoT Hub telemetry ingress pattern tied to downstream compute.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-factory-twins-pulumi-91024",
      storageAccount: "aztwinops91024",
      blobContainer: "telemetry-archive",
      iotHub: "iot-twins-91024",
      eventHubNamespace: "eh-twins-91024",
      eventHub: "twin-telemetry",
      functionAppPlan: "plan-twins-91024",
      functionApp: "func-twins-91024",
      cosmosAccount: "cosmos-twins-91024",
      cosmosDatabase: "TwinStateDb",
      cosmosContainer: "TwinState",
      digitalTwins: "adt-twins-91024",
      serviceBusNamespace: "sb-twins-91024",
      serviceBusQueue: "twin-commands",
      eventGridTopic: "eg-twins-91024",
      keyVault: "kv-twins-91024",
      appConfigStore: "cfg-twins-91024",
      logAnalyticsWorkspace: "log-twins-91024",
      applicationInsights: "appi-twins-91024",
    },
    expectedOutputKeys: [
      "TwinOpsStorageAccountName",
      "TwinOpsArchiveContainerName",
      "TwinOpsIotHubName",
      "TwinOpsEventHubNamespaceName",
      "TwinOpsEventHubName",
      "TwinOpsFunctionHostName",
      "TwinOpsCosmosAccountName",
      "TwinOpsCosmosDatabaseName",
      "TwinOpsCosmosContainerName",
      "TwinOpsDigitalTwinsName",
      "TwinOpsServiceBusQueueName",
      "TwinOpsEventGridTopicEndpoint",
      "TwinOpsKeyVaultName",
      "TwinOpsAppConfigName",
      "TwinOpsAppInsightsName",
      "TwinOpsLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "storage.",
      "devices.",
      "eventhub.",
      "web.",
      "documentdb.",
      "digitaltwins.",
      "servicebus.Queue",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "insights.",
      "telemetry-archive",
      "twin-commands",
      "TwinStateDb",
      "TwinState",
    ],
    forbiddenSourceMarkers: ["apimanagement", "containerservice", "dbformysql", "dbforpostgresql", "frontdoor", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/aztwinops91024", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/aztwinops91024/blobServices/default/containers/telemetry-archive", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "iot-hub", provider: "Microsoft.Devices", typePath: "IotHubs/iot-twins-91024", apiVersion: "2023-06-30", expectedType: "Microsoft.Devices/IotHubs" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-twins-91024", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-twins-91024/eventhubs/twin-telemetry", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-twins-91024", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-twins-91024", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-twins-91024", apiVersion: "2024-02-15-preview", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
      { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-twins-91024/sqlDatabases/TwinStateDb", apiVersion: "2024-02-15-preview", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
      { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-twins-91024/sqlDatabases/TwinStateDb/containers/TwinState", apiVersion: "2024-02-15-preview", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
      { label: "digital-twins", provider: "Microsoft.DigitalTwins", typePath: "digitalTwinsInstances/adt-twins-91024", apiVersion: "2023-01-31", expectedType: "Microsoft.DigitalTwins/digitalTwinsInstances" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-twins-91024", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-twins-91024/queues/twin-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-twins-91024", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-twins-91024", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-twins-91024", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-twins-91024", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-twins-91024", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "455f06f5-5372-4aa3-aafa-be0fcdd80a56",
    prId: "Pr91025",
    scenarioId: "identity-scoped-serving-ring",
    title: "Identity scoped serving ring",
    prompt: [
      "Our ML platform team wants one Azure deployment for a serving ring that can stage images centrally, run serving clusters in two regions, keep rollout state in memory, and carry a single managed identity through the control plane instead of scattering credentials across the platform. They need the shared registry, two AKS clusters, one global entry point, one durable rollout lane, a managed identity resource, and the standard configuration, secret, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript.",
      "",
      "Use one Azure Container Registry, one user-assigned managed identity, one AKS cluster in `eastus`, one AKS cluster in `westus2`, one Azure Front Door profile with one endpoint, one Azure Cache for Redis for rollout state, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription, one Event Grid topic for release notifications, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-serving-ring-pulumi-91025`, registry `acrringserve91025`, managed identity `id-serving-ring-91025`, AKS cluster `aks-ring-east-91025`, AKS cluster `aks-ring-west-91025`, Front Door profile `afd-serving-ring-91025`, Front Door endpoint `serving-ring-endpoint`, Redis cache `redis-serving-ring-91025`, Service Bus namespace `sb-serving-ring-91025`, Service Bus topic `rollout-ring`, Service Bus subscription `east`, Service Bus subscription `west`, Event Grid topic `eg-serving-ring-91025`, Key Vault `kv-serving-ring-91025`, App Configuration store `cfg-serving-ring-91025`, action group `ag-serving-ring-91025`, metric alert `ma-serving-ring-91025`, Log Analytics workspace `log-serving-ring-91025`, and Application Insights component `appi-serving-ring-91025`.",
      "",
      "Keep this focused on the serving ring itself. Do not add API Management, Application Gateway, MySQL, PostgreSQL, Cosmos DB, Logic Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ServingRingRegistryName`, `ServingRingManagedIdentityName`, `ServingRingEastClusterName`, `ServingRingWestClusterName`, `ServingRingFrontDoorProfileName`, `ServingRingFrontDoorEndpointHostName`, `ServingRingRedisName`, `ServingRingTopicName`, `ServingRingEastSubscriptionName`, `ServingRingWestSubscriptionName`, `ServingRingEventGridTopicEndpoint`, `ServingRingKeyVaultName`, `ServingRingAppConfigName`, `ServingRingActionGroupName`, `ServingRingMetricAlertName`, `ServingRingAppInsightsName`, `ServingRingLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Use a system-assigned managed identity in Azure Kubernetes Service",
        url: "https://learn.microsoft.com/en-us/azure/aks/system-assigned-managed-identity",
        why: "Grounds the AKS managed identity and role-based control model.",
      },
      {
        title: "Use a managed identity in Azure Kubernetes Service",
        url: "https://learn.microsoft.com/en-ca/azure/aks/use-managed-identity",
        why: "Grounds user-assigned and kubelet identity attachment patterns for AKS.",
      },
      {
        title: "AKS multi-cluster architecture",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
        why: "Grounds the active/active multi-region serving topology.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-serving-ring-pulumi-91025",
      registry: "acrringserve91025",
      managedIdentity: "id-serving-ring-91025",
      eastCluster: "aks-ring-east-91025",
      westCluster: "aks-ring-west-91025",
      frontDoorProfile: "afd-serving-ring-91025",
      frontDoorEndpoint: "serving-ring-endpoint",
      redis: "redis-serving-ring-91025",
      serviceBusNamespace: "sb-serving-ring-91025",
      serviceBusTopic: "rollout-ring",
      eastSubscription: "east",
      westSubscription: "west",
      eventGridTopic: "eg-serving-ring-91025",
      keyVault: "kv-serving-ring-91025",
      appConfigStore: "cfg-serving-ring-91025",
      actionGroup: "ag-serving-ring-91025",
      metricAlert: "ma-serving-ring-91025",
      logAnalyticsWorkspace: "log-serving-ring-91025",
      applicationInsights: "appi-serving-ring-91025",
    },
    expectedOutputKeys: [
      "ServingRingRegistryName",
      "ServingRingManagedIdentityName",
      "ServingRingEastClusterName",
      "ServingRingWestClusterName",
      "ServingRingFrontDoorProfileName",
      "ServingRingFrontDoorEndpointHostName",
      "ServingRingRedisName",
      "ServingRingTopicName",
      "ServingRingEastSubscriptionName",
      "ServingRingWestSubscriptionName",
      "ServingRingEventGridTopicEndpoint",
      "ServingRingKeyVaultName",
      "ServingRingAppConfigName",
      "ServingRingActionGroupName",
      "ServingRingMetricAlertName",
      "ServingRingAppInsightsName",
      "ServingRingLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "containerregistry.",
      "managedidentity.",
      "containerservice.",
      "cdn.",
      "cache.Redis",
      "servicebus.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "operationalinsights.",
      "aks-ring-east-91025",
      "aks-ring-west-91025",
      "rollout-ring",
    ],
    forbiddenSourceMarkers: ["apimanagement", "documentdb", "dbformysql", "dbforpostgresql", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrringserve91025", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "managed-identity", provider: "Microsoft.ManagedIdentity", typePath: "userAssignedIdentities/id-serving-ring-91025", apiVersion: "2023-01-31", expectedType: "Microsoft.ManagedIdentity/userAssignedIdentities" },
      { label: "aks-east", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-ring-east-91025", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "aks-west", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-ring-west-91025", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-ring-91025", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-ring-91025/afdEndpoints/serving-ring-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-serving-ring-91025", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-ring-91025", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-ring-91025/topics/rollout-ring", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-ring-91025/topics/rollout-ring/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-ring-91025/topics/rollout-ring/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-serving-ring-91025", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-serving-ring-91025", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-serving-ring-91025", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-serving-ring-91025", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-serving-ring-91025", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-serving-ring-91025", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-serving-ring-91025", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "34440c51-f64b-458c-b6ab-4a4afdc20aea",
    prId: "Pr91026",
    scenarioId: "branch-discovery-cache-mesh",
    title: "Branch discovery cache mesh",
    prompt: [
      "Our branch platform team wants one Azure deployment for an internal routing mesh that can keep branch services off the public internet, expose stable private DNS names, front worker traffic with an internal load balancer, share evidence files, and keep routing state in memory. They need one virtual network, one private discovery zone, one internal traffic surface, one container app environment, a durable queue, one file share, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one virtual network with one services subnet, one internal Azure Load Balancer, one Azure Private DNS zone linked to that virtual network, one managed Azure Container Apps environment with three internal container apps, one Service Bus namespace with one queue for branch jobs, one storage account with one Azure Files share, one Azure Cache for Redis, one Event Grid topic for branch notifications, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-branch-mesh-pulumi-91026`, virtual network `vnet-branch-mesh-91026`, services subnet `snet-services-91026`, private DNS zone `branch.internal`, private DNS virtual network link `branch-link-91026`, private DNS A record `gateway.branch.internal`, private DNS A record `files.branch.internal`, Load Balancer `lb-branch-mesh-91026`, Container Apps environment `cae-branch-mesh-91026`, Container App `ca-branch-gateway-91026`, Container App `ca-branch-workers-91026`, Container App `ca-branch-files-91026`, Service Bus namespace `sb-branch-mesh-91026`, Service Bus queue `branch-jobs`, storage account `azbranchmesh91026`, Azure Files share `branch-evidence`, Redis cache `redis-branch-mesh-91026`, Event Grid topic `eg-branch-mesh-91026`, Key Vault `kv-branch-mesh-91026`, App Configuration store `cfg-branch-mesh-91026`, Log Analytics workspace `log-branch-mesh-91026`, and Application Insights component `appi-branch-mesh-91026`.",
      "",
      "Keep every workload surface internal-only in this task. Do not add Front Door, API Management, AKS, Cosmos DB, MySQL, PostgreSQL, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `BranchMeshVirtualNetworkName`, `BranchMeshPrivateDnsZoneName`, `BranchMeshLoadBalancerName`, `BranchMeshEnvironmentName`, `BranchMeshGatewayAppName`, `BranchMeshWorkersAppName`, `BranchMeshFilesAppName`, `BranchMeshServiceBusQueueName`, `BranchMeshStorageAccountName`, `BranchMeshFileShareName`, `BranchMeshRedisName`, `BranchMeshEventGridTopicEndpoint`, `BranchMeshKeyVaultName`, `BranchMeshAppConfigName`, `BranchMeshAppInsightsName`, `BranchMeshLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Container Apps overview",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/overview",
        why: "Grounds internal container apps, built-in service discovery, and VNet integration.",
      },
      {
        title: "What is a virtual network link in Azure Private DNS",
        url: "https://learn.microsoft.com/en-us/azure/dns/private-dns-virtual-network-links",
        why: "Grounds private DNS service discovery and VNet link behavior.",
      },
      {
        title: "Azure Load Balancer overview",
        url: "https://learn.microsoft.com/en-gb/azure/load-balancer/load-balancer-overview",
        why: "Grounds the internal TCP/UDP traffic distribution surface in the branch mesh.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-branch-mesh-pulumi-91026",
      virtualNetwork: "vnet-branch-mesh-91026",
      servicesSubnet: "snet-services-91026",
      privateDnsZone: "branch.internal",
      privateDnsLink: "branch-link-91026",
      gatewayRecord: "gateway.branch.internal",
      filesRecord: "files.branch.internal",
      loadBalancer: "lb-branch-mesh-91026",
      managedEnvironment: "cae-branch-mesh-91026",
      gatewayApp: "ca-branch-gateway-91026",
      workersApp: "ca-branch-workers-91026",
      filesApp: "ca-branch-files-91026",
      serviceBusNamespace: "sb-branch-mesh-91026",
      serviceBusQueue: "branch-jobs",
      storageAccount: "azbranchmesh91026",
      fileShare: "branch-evidence",
      redis: "redis-branch-mesh-91026",
      eventGridTopic: "eg-branch-mesh-91026",
      keyVault: "kv-branch-mesh-91026",
      appConfigStore: "cfg-branch-mesh-91026",
      logAnalyticsWorkspace: "log-branch-mesh-91026",
      applicationInsights: "appi-branch-mesh-91026",
    },
    expectedOutputKeys: [
      "BranchMeshVirtualNetworkName",
      "BranchMeshPrivateDnsZoneName",
      "BranchMeshLoadBalancerName",
      "BranchMeshEnvironmentName",
      "BranchMeshGatewayAppName",
      "BranchMeshWorkersAppName",
      "BranchMeshFilesAppName",
      "BranchMeshServiceBusQueueName",
      "BranchMeshStorageAccountName",
      "BranchMeshFileShareName",
      "BranchMeshRedisName",
      "BranchMeshEventGridTopicEndpoint",
      "BranchMeshKeyVaultName",
      "BranchMeshAppConfigName",
      "BranchMeshAppInsightsName",
      "BranchMeshLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "network.VirtualNetwork",
      "network.LoadBalancer",
      "network.PrivateZone",
      "network.VirtualNetworkLink",
      "network.PrivateRecordSet",
      "app.ManagedEnvironment",
      "app.ContainerApp",
      "servicebus.Queue",
      "storage.FileShare",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "branch-evidence",
      "branch-jobs",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbformysql", "dbforpostgresql", "private endpoint"],
    integrationChecks: [
      { label: "virtual-network", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-branch-mesh-91026", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "services-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-branch-mesh-91026/subnets/snet-services-91026", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
      { label: "private-dns-link", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/virtualNetworkLinks/branch-link-91026", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "gateway-record", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/A/gateway", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "files-record", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/A/files", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "load-balancer", provider: "Microsoft.Network", typePath: "loadBalancers/lb-branch-mesh-91026", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/loadBalancers" },
      { label: "managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-branch-mesh-91026", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "gateway-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-gateway-91026", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "workers-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-workers-91026", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "files-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-files-91026", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-branch-mesh-91026", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-branch-mesh-91026/queues/branch-jobs", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azbranchmesh91026", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azbranchmesh91026/fileServices/default/shares/branch-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-branch-mesh-91026", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-branch-mesh-91026", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-branch-mesh-91026", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-branch-mesh-91026", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-branch-mesh-91026", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-branch-mesh-91026", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "73f3f2bd-7ffe-4517-a56c-2cf8cdc84a2e",
    prId: "Pr91027",
    scenarioId: "warehouse-anomaly-alert-plane",
    title: "Warehouse anomaly alert plane",
    prompt: [
      "Our operations analytics team wants one Azure deployment for an anomaly response plane that can ingest operational events, enrich them with serverless processing, persist warehouse analytics state, dispatch analyst review work, and alert the on-call path when warehouse signals or control-plane drift show up. They need the live event ingress, the warehouse analytics surface, one workflow surface, one durable analyst command lane, one low-latency cache, one evidence store, and one alerting plane in the same stack. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Event Hubs namespace with one event hub, one Function App for enrichment, one Synapse workspace with one SQL pool, one Logic App workflow for analyst review orchestration, one Service Bus namespace with one queue for analyst review jobs, one Azure Cache for Redis, one Event Grid topic for anomaly fan-out, one storage account with one blob container and one Azure Files share, one Azure Monitor action group, one Azure Monitor metric alert, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-anomaly-warehouse-pulumi-91027`, Event Hubs namespace `eh-anomaly-91027`, Event Hub `anomaly-stream`, Function App plan `plan-anomaly-91027`, Function App `func-anomaly-91027`, Synapse workspace `syn-anomaly-91027`, Synapse SQL pool `anomalypool`, Logic App workflow `la-anomaly-91027`, Service Bus namespace `sb-anomaly-91027`, Service Bus queue `analyst-review`, Redis cache `redis-anomaly-91027`, Event Grid topic `eg-anomaly-91027`, storage account `azanomalywh91027`, blob container `staged-facts`, Azure Files share `analyst-drop`, action group `ag-anomaly-91027`, metric alert `ma-anomaly-91027`, Key Vault `kv-anomaly-91027`, App Configuration store `cfg-anomaly-91027`, Log Analytics workspace `log-anomaly-91027`, and Application Insights component `appi-anomaly-91027`.",
      "",
      "Keep this focused on the anomaly plane. Do not add Front Door, API Management, AKS, Cosmos DB, MySQL, PostgreSQL, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `AnomalyEventHubNamespaceName`, `AnomalyEventHubName`, `AnomalyFunctionHostName`, `AnomalySynapseWorkspaceName`, `AnomalySqlPoolName`, `AnomalyWorkflowName`, `AnomalyServiceBusQueueName`, `AnomalyRedisName`, `AnomalyEventGridTopicEndpoint`, `AnomalyStorageAccountName`, `AnomalyBlobContainerName`, `AnomalyFileShareName`, `AnomalyActionGroupName`, `AnomalyMetricAlertName`, `AnomalyKeyVaultName`, `AnomalyAppConfigName`, `AnomalyAppInsightsName`, `AnomalyLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Integrate Event Hubs with serverless functions on Azure",
        url: "https://learn.microsoft.com/en-us/azure/architecture/serverless/event-hubs-functions/event-hubs-functions",
        why: "Grounds the event ingestion and serverless enrichment path.",
      },
      {
        title: "What is Azure Synapse Analytics?",
        url: "https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is",
        why: "Grounds the warehouse analytics and dedicated SQL pool surface.",
      },
      {
        title: "Create or edit a metric alert rule",
        url: "https://learn.microsoft.com/en-us/azure/azure-monitor/alerts/alerts-create-metric-alert-rule",
        why: "Grounds the alert rule surface for warehouse anomaly detection.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-anomaly-warehouse-pulumi-91027",
      eventHubNamespace: "eh-anomaly-91027",
      eventHub: "anomaly-stream",
      functionAppPlan: "plan-anomaly-91027",
      functionApp: "func-anomaly-91027",
      synapseWorkspace: "syn-anomaly-91027",
      synapseSqlPool: "anomalypool",
      logicWorkflow: "la-anomaly-91027",
      serviceBusNamespace: "sb-anomaly-91027",
      serviceBusQueue: "analyst-review",
      redis: "redis-anomaly-91027",
      eventGridTopic: "eg-anomaly-91027",
      storageAccount: "azanomalywh91027",
      blobContainer: "staged-facts",
      fileShare: "analyst-drop",
      actionGroup: "ag-anomaly-91027",
      metricAlert: "ma-anomaly-91027",
      keyVault: "kv-anomaly-91027",
      appConfigStore: "cfg-anomaly-91027",
      logAnalyticsWorkspace: "log-anomaly-91027",
      applicationInsights: "appi-anomaly-91027",
    },
    expectedOutputKeys: [
      "AnomalyEventHubNamespaceName",
      "AnomalyEventHubName",
      "AnomalyFunctionHostName",
      "AnomalySynapseWorkspaceName",
      "AnomalySqlPoolName",
      "AnomalyWorkflowName",
      "AnomalyServiceBusQueueName",
      "AnomalyRedisName",
      "AnomalyEventGridTopicEndpoint",
      "AnomalyStorageAccountName",
      "AnomalyBlobContainerName",
      "AnomalyFileShareName",
      "AnomalyActionGroupName",
      "AnomalyMetricAlertName",
      "AnomalyKeyVaultName",
      "AnomalyAppConfigName",
      "AnomalyAppInsightsName",
      "AnomalyLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "eventhub.",
      "web.",
      "synapse.",
      "logic.",
      "servicebus.Queue",
      "cache.Redis",
      "eventgrid.",
      "storage.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "staged-facts",
      "analyst-drop",
      "analyst-review",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbformysql", "dbforpostgresql", "private endpoint"],
    integrationChecks: [
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-anomaly-91027", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-anomaly-91027/eventhubs/anomaly-stream", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-anomaly-91027", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-anomaly-91027", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "synapse-workspace", provider: "Microsoft.Synapse", typePath: "workspaces/syn-anomaly-91027", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces" },
      { label: "synapse-sql-pool", provider: "Microsoft.Synapse", typePath: "workspaces/syn-anomaly-91027/sqlPools/anomalypool", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces/sqlPools" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-anomaly-91027", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-anomaly-91027", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-anomaly-91027/queues/analyst-review", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-anomaly-91027", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-anomaly-91027", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azanomalywh91027", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azanomalywh91027/blobServices/default/containers/staged-facts", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azanomalywh91027/fileServices/default/shares/analyst-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-anomaly-91027", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-anomaly-91027", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-anomaly-91027", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-anomaly-91027", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-anomaly-91027", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-anomaly-91027", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "d7c2e01b-6925-4f2d-ba8a-03ee7bca4e37",
    prId: "Pr91028",
    scenarioId: "regional-cutover-data-bridge",
    title: "Regional cutover data bridge",
    prompt: [
      "Our platform migration team needs one Azure deployment that can carry a regional database cutover without relying on manual runbooks. They want the primary transactional store, one database migration control plane, one durable event lane with two regional subscriptions, a lightweight application surface for operator traffic and worker execution, a file handoff area for cutover artifacts, and the usual secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Azure Database for MySQL flexible server with one database, one Azure Database Migration Service with one project, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription, one Event Grid topic, one managed Azure Container Apps environment with one API app and one worker app, one storage account with one Azure Files share for migration artifacts, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-cutover-bridge-pulumi-91028`, MySQL flexible server `mysql-cutover-91028`, MySQL database `cutoverdb`, Database Migration Service `dms-cutover-91028`, Database Migration project `cutoverproject`, Service Bus namespace `sb-cutover-91028`, Service Bus topic `cutover-events`, Service Bus subscription `east`, Service Bus subscription `west`, Event Grid topic `eg-cutover-91028`, Container Apps environment `cae-cutover-91028`, Container App `ca-cutover-api-91028`, Container App `ca-cutover-worker-91028`, storage account `azcutover91028`, Azure Files share `migration-drop`, Key Vault `kv-cutover-91028`, App Configuration store `cfg-cutover-91028`, action group `ag-cutover-91028`, metric alert `ma-cutover-91028`, Log Analytics workspace `log-cutover-91028`, and Application Insights component `appi-cutover-91028`.",
      "",
      "Keep this focused on the cutover bridge. Do not add Front Door, API Management, AKS, Cosmos DB, PostgreSQL, Logic Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `CutoverMySqlServerName`, `CutoverMySqlDatabaseName`, `CutoverDmsServiceName`, `CutoverDmsProjectName`, `CutoverTopicName`, `CutoverEastSubscriptionName`, `CutoverWestSubscriptionName`, `CutoverEnvironmentName`, `CutoverApiAppName`, `CutoverWorkerAppName`, `CutoverFileShareName`, `CutoverEventGridTopicEndpoint`, `CutoverKeyVaultName`, `CutoverAppConfigName`, `CutoverActionGroupName`, `CutoverMetricAlertName`, `CutoverAppInsightsName`, `CutoverLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Database Migration Service overview",
        url: "https://learn.microsoft.com/en-us/azure/dms/dms-overview",
        why: "Grounds the migration control-plane surface and project hierarchy.",
      },
      {
        title: "Azure Database for MySQL flexible server overview",
        url: "https://learn.microsoft.com/en-us/azure/mysql/flexible-server/overview",
        why: "Grounds the target transactional database service and database resource shape.",
      },
      {
        title: "Azure Container Apps overview",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/overview",
        why: "Grounds the small operator-facing application surface used during cutover.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-cutover-bridge-pulumi-91028",
      mysqlServer: "mysql-cutover-91028",
      mysqlDatabase: "cutoverdb",
      dmsService: "dms-cutover-91028",
      dmsProject: "cutoverproject",
      serviceBusNamespace: "sb-cutover-91028",
      serviceBusTopic: "cutover-events",
      eastSubscription: "east",
      westSubscription: "west",
      eventGridTopic: "eg-cutover-91028",
      managedEnvironment: "cae-cutover-91028",
      apiApp: "ca-cutover-api-91028",
      workerApp: "ca-cutover-worker-91028",
      storageAccount: "azcutover91028",
      fileShare: "migration-drop",
      keyVault: "kv-cutover-91028",
      appConfigStore: "cfg-cutover-91028",
      actionGroup: "ag-cutover-91028",
      metricAlert: "ma-cutover-91028",
      logAnalyticsWorkspace: "log-cutover-91028",
      applicationInsights: "appi-cutover-91028",
    },
    expectedOutputKeys: [
      "CutoverMySqlServerName",
      "CutoverMySqlDatabaseName",
      "CutoverDmsServiceName",
      "CutoverDmsProjectName",
      "CutoverTopicName",
      "CutoverEastSubscriptionName",
      "CutoverWestSubscriptionName",
      "CutoverEnvironmentName",
      "CutoverApiAppName",
      "CutoverWorkerAppName",
      "CutoverFileShareName",
      "CutoverEventGridTopicEndpoint",
      "CutoverKeyVaultName",
      "CutoverAppConfigName",
      "CutoverActionGroupName",
      "CutoverMetricAlertName",
      "CutoverAppInsightsName",
      "CutoverLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "dbformysql.",
      "datamigration.",
      "servicebus.",
      "eventgrid.",
      "app.ManagedEnvironment",
      "app.ContainerApp",
      "storage.FileShare",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "operationalinsights.",
      "cutover-events",
      "migration-drop",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbforpostgresql", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-cutover-91028", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-cutover-91028/databases/cutoverdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-91028", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
      { label: "dms-project", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-91028/projects/cutoverproject", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-91028", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-91028/topics/cutover-events", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-91028/topics/cutover-events/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-91028/topics/cutover-events/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-cutover-91028", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-cutover-91028", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "api-app", provider: "Microsoft.App", typePath: "containerApps/ca-cutover-api-91028", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "worker-app", provider: "Microsoft.App", typePath: "containerApps/ca-cutover-worker-91028", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azcutover91028", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azcutover91028/fileServices/default/shares/migration-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-cutover-91028", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-cutover-91028", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-cutover-91028", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-cutover-91028", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-cutover-91028", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-cutover-91028", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "783fc126-f5fd-47ac-98a1-70ed5c7b1440",
    prId: "Pr91029",
    scenarioId: "partner-command-audit-fabric",
    title: "Partner command audit fabric",
    prompt: [
      "Our partner operations team wants one Azure deployment for a command and audit plane that can accept partner calls through a managed gateway, fan those calls into serverless execution, run a long-lived review workflow, keep a durable audit stream, persist partner command state in a transactional store, and retain evidence in a shared file surface. They also need the usual secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Azure API Management service with one API and one product, one Function App and one App Service plan, one Logic App workflow, one Event Hubs namespace with one event hub, one Service Bus namespace with one queue, one Azure Database for PostgreSQL flexible server with one database, one storage account with one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor activity log alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-partner-command-pulumi-91029`, API Management service `apim-partner-command-91029`, API Management API `partner-command-api`, API Management product `partner-command-product`, Function App plan `plan-partner-command-91029`, Function App `func-partner-command-91029`, Logic App workflow `la-partner-command-91029`, Event Hubs namespace `eh-partner-command-91029`, Event Hub `partner-audit`, Service Bus namespace `sb-partner-command-91029`, Service Bus queue `partner-review`, PostgreSQL flexible server `pg-partner-command-91029`, PostgreSQL database `commanddb`, storage account `azpartnercmd91029`, Azure Files share `partner-audit`, Redis cache `redis-partner-command-91029`, Event Grid topic `eg-partner-command-91029`, Key Vault `kv-partner-command-91029`, App Configuration store `cfg-partner-command-91029`, action group `ag-partner-command-91029`, activity log alert `ala-partner-command-91029`, Log Analytics workspace `log-partner-command-91029`, and Application Insights component `appi-partner-command-91029`.",
      "",
      "Keep this scoped to the partner command plane. Do not add Front Door, AKS, MySQL, Cosmos DB, DMS, Application Gateway, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `PartnerCommandApiGatewayUrl`, `PartnerCommandFunctionHostName`, `PartnerCommandWorkflowName`, `PartnerCommandEventHubNamespaceName`, `PartnerCommandEventHubName`, `PartnerCommandServiceBusQueueName`, `PartnerCommandPostgresServerName`, `PartnerCommandDatabaseName`, `PartnerCommandFileShareName`, `PartnerCommandRedisName`, `PartnerCommandEventGridTopicEndpoint`, `PartnerCommandKeyVaultName`, `PartnerCommandAppConfigName`, `PartnerCommandActionGroupName`, `PartnerCommandActivityLogAlertName`, `PartnerCommandAppInsightsName`, `PartnerCommandLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "API Management landing zone accelerator",
        url: "https://learn.microsoft.com/en-us/azure/api-management/landing-zone-accelerator",
        why: "Grounds the managed gateway boundary and audit posture for partner-facing APIs.",
      },
      {
        title: "Azure Event Hubs overview",
        url: "https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about",
        why: "Grounds the durable audit stream and replay surface.",
      },
      {
        title: "Azure Database for PostgreSQL flexible server overview",
        url: "https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview",
        why: "Grounds the transactional system-of-record database service.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-partner-command-pulumi-91029",
      apiManagementService: "apim-partner-command-91029",
      apiManagementApi: "partner-command-api",
      apiManagementProduct: "partner-command-product",
      functionAppPlan: "plan-partner-command-91029",
      functionApp: "func-partner-command-91029",
      logicWorkflow: "la-partner-command-91029",
      eventHubNamespace: "eh-partner-command-91029",
      eventHub: "partner-audit",
      serviceBusNamespace: "sb-partner-command-91029",
      serviceBusQueue: "partner-review",
      postgresServer: "pg-partner-command-91029",
      postgresDatabase: "commanddb",
      storageAccount: "azpartnercmd91029",
      fileShare: "partner-audit",
      redis: "redis-partner-command-91029",
      eventGridTopic: "eg-partner-command-91029",
      keyVault: "kv-partner-command-91029",
      appConfigStore: "cfg-partner-command-91029",
      actionGroup: "ag-partner-command-91029",
      activityLogAlert: "ala-partner-command-91029",
      logAnalyticsWorkspace: "log-partner-command-91029",
      applicationInsights: "appi-partner-command-91029",
    },
    expectedOutputKeys: [
      "PartnerCommandApiGatewayUrl",
      "PartnerCommandFunctionHostName",
      "PartnerCommandWorkflowName",
      "PartnerCommandEventHubNamespaceName",
      "PartnerCommandEventHubName",
      "PartnerCommandServiceBusQueueName",
      "PartnerCommandPostgresServerName",
      "PartnerCommandDatabaseName",
      "PartnerCommandFileShareName",
      "PartnerCommandRedisName",
      "PartnerCommandEventGridTopicEndpoint",
      "PartnerCommandKeyVaultName",
      "PartnerCommandAppConfigName",
      "PartnerCommandActionGroupName",
      "PartnerCommandActivityLogAlertName",
      "PartnerCommandAppInsightsName",
      "PartnerCommandLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement.",
      "web.",
      "logic.",
      "eventhub.",
      "servicebus.Queue",
      "dbforpostgresql.",
      "storage.FileShare",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "partner-review",
      "partner-audit",
    ],
    forbiddenSourceMarkers: ["frontdoor", "containerservice", "dbformysql", "documentdb", "datamigration", "ApplicationGateway", "private endpoint"],
    integrationChecks: [
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-command-91029", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-command-91029/apis/partner-command-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-partner-command-91029/products/partner-command-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-partner-command-91029", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-partner-command-91029", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-partner-command-91029", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-partner-command-91029", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-partner-command-91029/eventhubs/partner-audit", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-partner-command-91029", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-partner-command-91029/queues/partner-review", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-partner-command-91029", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-partner-command-91029/databases/commanddb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartnercmd91029", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azpartnercmd91029/fileServices/default/shares/partner-audit", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-partner-command-91029", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-partner-command-91029", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-partner-command-91029", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-partner-command-91029", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-partner-command-91029", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-partner-command-91029", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-partner-command-91029", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-partner-command-91029", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "ddfbf297-aef2-4f7b-93cf-8038153eca95",
    prId: "Pr91030",
    scenarioId: "global-inference-security-ring",
    title: "Global inference security ring",
    prompt: [
      "Our model serving security team needs one Azure deployment that can front two regional inference clusters behind one global edge, keep the release lane durable, hold rollout state in memory, and wire the entire control plane through managed services instead of scattered secrets. They need the image registry, one managed identity, two AKS clusters, one global edge surface with WAF policy, one managed API surface, one durable rollout queue, one event topic, and the normal configuration, secret, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript.",
      "",
      "Use one Azure Container Registry, one user-assigned managed identity, one AKS cluster in `eastus`, one AKS cluster in `westus2`, one Azure Front Door profile with one endpoint and one security policy backed by one WAF policy, one Azure API Management service with one API, one Service Bus namespace with one queue, one Event Grid topic, one Azure Cache for Redis, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-inference-sec-ring-pulumi-91030`, registry `acrinfsec91030`, managed identity `id-inference-sec-91030`, AKS cluster `aks-sec-east-91030`, AKS cluster `aks-sec-west-91030`, Front Door profile `afd-inference-sec-91030`, Front Door endpoint `inference-sec-endpoint`, Front Door security policy `inference-sec-policy`, WAF policy `waf-inference-sec-91030`, API Management service `apim-inference-sec-91030`, API Management API `inference-sec-api`, Service Bus namespace `sb-inference-sec-91030`, Service Bus queue `inference-rollout`, Event Grid topic `eg-inference-sec-91030`, Redis cache `redis-inference-sec-91030`, Key Vault `kv-inference-sec-91030`, App Configuration store `cfg-inference-sec-91030`, action group `ag-inference-sec-91030`, metric alert `ma-inference-sec-91030`, activity log alert `ala-inference-sec-91030`, Log Analytics workspace `log-inference-sec-91030`, and Application Insights component `appi-inference-sec-91030`.",
      "",
      "Keep this focused on the global serving control plane. Do not add MySQL, PostgreSQL, Cosmos DB, Logic Apps, Application Gateway, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `InferenceSecRegistryName`, `InferenceSecManagedIdentityName`, `InferenceSecEastClusterName`, `InferenceSecWestClusterName`, `InferenceSecFrontDoorProfileName`, `InferenceSecFrontDoorEndpointHostName`, `InferenceSecSecurityPolicyName`, `InferenceSecApiGatewayUrl`, `InferenceSecServiceBusQueueName`, `InferenceSecEventGridTopicEndpoint`, `InferenceSecRedisName`, `InferenceSecKeyVaultName`, `InferenceSecAppConfigName`, `InferenceSecActionGroupName`, `InferenceSecMetricAlertName`, `InferenceSecActivityLogAlertName`, `InferenceSecAppInsightsName`, `InferenceSecLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "AKS multi-cluster architecture",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
        why: "Grounds the two-cluster serving topology and regional split.",
      },
      {
        title: "Web Application Firewall with Azure Front Door",
        url: "https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/afds-overview",
        why: "Grounds the Front Door and WAF pairing for a global edge.",
      },
      {
        title: "Azure API Management landing zone accelerator",
        url: "https://learn.microsoft.com/en-us/azure/api-management/landing-zone-accelerator",
        why: "Grounds the managed API boundary around the inference ring.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-inference-sec-ring-pulumi-91030",
      registry: "acrinfsec91030",
      managedIdentity: "id-inference-sec-91030",
      eastCluster: "aks-sec-east-91030",
      westCluster: "aks-sec-west-91030",
      frontDoorProfile: "afd-inference-sec-91030",
      frontDoorEndpoint: "inference-sec-endpoint",
      securityPolicy: "inference-sec-policy",
      wafPolicy: "waf-inference-sec-91030",
      apiManagementService: "apim-inference-sec-91030",
      apiManagementApi: "inference-sec-api",
      serviceBusNamespace: "sb-inference-sec-91030",
      serviceBusQueue: "inference-rollout",
      eventGridTopic: "eg-inference-sec-91030",
      redis: "redis-inference-sec-91030",
      keyVault: "kv-inference-sec-91030",
      appConfigStore: "cfg-inference-sec-91030",
      actionGroup: "ag-inference-sec-91030",
      metricAlert: "ma-inference-sec-91030",
      activityLogAlert: "ala-inference-sec-91030",
      logAnalyticsWorkspace: "log-inference-sec-91030",
      applicationInsights: "appi-inference-sec-91030",
    },
    expectedOutputKeys: [
      "InferenceSecRegistryName",
      "InferenceSecManagedIdentityName",
      "InferenceSecEastClusterName",
      "InferenceSecWestClusterName",
      "InferenceSecFrontDoorProfileName",
      "InferenceSecFrontDoorEndpointHostName",
      "InferenceSecSecurityPolicyName",
      "InferenceSecApiGatewayUrl",
      "InferenceSecServiceBusQueueName",
      "InferenceSecEventGridTopicEndpoint",
      "InferenceSecRedisName",
      "InferenceSecKeyVaultName",
      "InferenceSecAppConfigName",
      "InferenceSecActionGroupName",
      "InferenceSecMetricAlertName",
      "InferenceSecActivityLogAlertName",
      "InferenceSecAppInsightsName",
      "InferenceSecLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "containerregistry.",
      "managedidentity.",
      "containerservice.",
      "cdn.",
      "network.WebApplicationFirewallPolicy",
      "apimanagement.",
      "servicebus.Queue",
      "eventgrid.",
      "cache.Redis",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "inference-rollout",
    ],
    forbiddenSourceMarkers: ["dbformysql", "dbforpostgresql", "documentdb", "logic.", "ApplicationGateway", "private endpoint"],
    integrationChecks: [
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrinfsec91030", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "managed-identity", provider: "Microsoft.ManagedIdentity", typePath: "userAssignedIdentities/id-inference-sec-91030", apiVersion: "2023-01-31", expectedType: "Microsoft.ManagedIdentity/userAssignedIdentities" },
      { label: "aks-east", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-sec-east-91030", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "aks-west", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-sec-west-91030", apiVersion: "2024-02-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-inference-sec-91030", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-inference-sec-91030/afdEndpoints/inference-sec-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-inference-sec-91030/securityPolicies/inference-sec-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-inference-sec-91030", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-inference-sec-91030", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-inference-sec-91030/apis/inference-sec-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-inference-sec-91030", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-inference-sec-91030/queues/inference-rollout", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-inference-sec-91030", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-inference-sec-91030", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-inference-sec-91030", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-inference-sec-91030", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-inference-sec-91030", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-inference-sec-91030", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-inference-sec-91030", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-inference-sec-91030", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-inference-sec-91030", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "10955d5d-f9e3-4012-8767-7cecbcadf0a9",
    prId: "Pr91031",
    scenarioId: "internal-discovery-failover-grid",
    title: "Internal discovery failover grid",
    prompt: [
      "Our platform networking team wants one Azure deployment for an internal discovery and failover grid that can hold two regional fabrics behind private names, keep workload entry points internal, fan coordination messages across two regions, and retain file-based evidence without exposing the estate publicly. They need two virtual networks, one shared private discovery zone, two internal traffic surfaces, two container app environments, a durable topic with regional subscriptions, one file share, one state cache, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript.",
      "",
      "Use one virtual network in `eastus` and one virtual network in `westus2`, one services subnet in each region, one Azure Private DNS zone linked to both virtual networks, one private DNS A record for `gateway.fabric.internal`, one for `workers.fabric.internal`, and one for `files.fabric.internal`, one internal Azure Load Balancer in each region, one managed Azure Container Apps environment in each region with one gateway app in each environment, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription, one storage account with one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-discovery-failover-pulumi-91031`, virtual network `vnet-failover-east-91031`, virtual network `vnet-failover-west-91031`, services subnet `snet-failover-east-91031`, services subnet `snet-failover-west-91031`, private DNS zone `fabric.internal`, private DNS virtual network link `fabric-link-east-91031`, private DNS virtual network link `fabric-link-west-91031`, private DNS A record `gateway.fabric.internal`, private DNS A record `workers.fabric.internal`, private DNS A record `files.fabric.internal`, Load Balancer `lb-failover-east-91031`, Load Balancer `lb-failover-west-91031`, Container Apps environment `cae-failover-east-91031`, Container Apps environment `cae-failover-west-91031`, Container App `ca-failover-east-91031`, Container App `ca-failover-west-91031`, Service Bus namespace `sb-failover-91031`, Service Bus topic `branch-failover`, Service Bus subscription `east`, Service Bus subscription `west`, storage account `azfailover91031`, Azure Files share `failover-drop`, Redis cache `redis-failover-91031`, Event Grid topic `eg-failover-91031`, Key Vault `kv-failover-91031`, App Configuration store `cfg-failover-91031`, Log Analytics workspace `log-failover-91031`, and Application Insights component `appi-failover-91031`.",
      "",
      "Keep every service surface internal-only in this task. Do not add Front Door, API Management, AKS, MySQL, PostgreSQL, Cosmos DB, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `FailoverEastVirtualNetworkName`, `FailoverWestVirtualNetworkName`, `FailoverPrivateDnsZoneName`, `FailoverEastLoadBalancerName`, `FailoverWestLoadBalancerName`, `FailoverEastEnvironmentName`, `FailoverWestEnvironmentName`, `FailoverEastAppName`, `FailoverWestAppName`, `FailoverTopicName`, `FailoverEastSubscriptionName`, `FailoverWestSubscriptionName`, `FailoverFileShareName`, `FailoverRedisName`, `FailoverEventGridTopicEndpoint`, `FailoverKeyVaultName`, `FailoverAppConfigName`, `FailoverAppInsightsName`, `FailoverLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "What is a virtual network link in Azure Private DNS",
        url: "https://learn.microsoft.com/en-us/azure/dns/private-dns-virtual-network-links",
        why: "Grounds the multi-VNet private discovery topology.",
      },
      {
        title: "Azure Load Balancer overview",
        url: "https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-overview",
        why: "Grounds the internal traffic surfaces in each region.",
      },
      {
        title: "Azure Container Apps networking",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/networking",
        why: "Grounds the internal environment and private ingress shape.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-discovery-failover-pulumi-91031",
      eastVirtualNetwork: "vnet-failover-east-91031",
      westVirtualNetwork: "vnet-failover-west-91031",
      eastSubnet: "snet-failover-east-91031",
      westSubnet: "snet-failover-west-91031",
      privateDnsZone: "fabric.internal",
      eastDnsLink: "fabric-link-east-91031",
      westDnsLink: "fabric-link-west-91031",
      gatewayRecord: "gateway.fabric.internal",
      workersRecord: "workers.fabric.internal",
      filesRecord: "files.fabric.internal",
      eastLoadBalancer: "lb-failover-east-91031",
      westLoadBalancer: "lb-failover-west-91031",
      eastEnvironment: "cae-failover-east-91031",
      westEnvironment: "cae-failover-west-91031",
      eastApp: "ca-failover-east-91031",
      westApp: "ca-failover-west-91031",
      serviceBusNamespace: "sb-failover-91031",
      serviceBusTopic: "branch-failover",
      eastSubscription: "east",
      westSubscription: "west",
      storageAccount: "azfailover91031",
      fileShare: "failover-drop",
      redis: "redis-failover-91031",
      eventGridTopic: "eg-failover-91031",
      keyVault: "kv-failover-91031",
      appConfigStore: "cfg-failover-91031",
      logAnalyticsWorkspace: "log-failover-91031",
      applicationInsights: "appi-failover-91031",
    },
    expectedOutputKeys: [
      "FailoverEastVirtualNetworkName",
      "FailoverWestVirtualNetworkName",
      "FailoverPrivateDnsZoneName",
      "FailoverEastLoadBalancerName",
      "FailoverWestLoadBalancerName",
      "FailoverEastEnvironmentName",
      "FailoverWestEnvironmentName",
      "FailoverEastAppName",
      "FailoverWestAppName",
      "FailoverTopicName",
      "FailoverEastSubscriptionName",
      "FailoverWestSubscriptionName",
      "FailoverFileShareName",
      "FailoverRedisName",
      "FailoverEventGridTopicEndpoint",
      "FailoverKeyVaultName",
      "FailoverAppConfigName",
      "FailoverAppInsightsName",
      "FailoverLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "network.VirtualNetwork",
      "network.LoadBalancer",
      "network.PrivateZone",
      "network.VirtualNetworkLink",
      "network.PrivateRecordSet",
      "app.ManagedEnvironment",
      "app.ContainerApp",
      "servicebus.",
      "storage.FileShare",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "operationalinsights.",
      "fabric.internal",
      "branch-failover",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "dbformysql", "dbforpostgresql", "documentdb", "private endpoint"],
    integrationChecks: [
      { label: "east-virtual-network", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-failover-east-91031", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-virtual-network", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-failover-west-91031", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-failover-east-91031/subnets/snet-failover-east-91031", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-failover-west-91031/subnets/snet-failover-west-91031", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
      { label: "private-dns-link-east", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal/virtualNetworkLinks/fabric-link-east-91031", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "private-dns-link-west", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal/virtualNetworkLinks/fabric-link-west-91031", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "gateway-record", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal/A/gateway", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "workers-record", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal/A/workers", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "files-record", provider: "Microsoft.Network", typePath: "privateDnsZones/fabric.internal/A/files", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "east-load-balancer", provider: "Microsoft.Network", typePath: "loadBalancers/lb-failover-east-91031", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/loadBalancers" },
      { label: "west-load-balancer", provider: "Microsoft.Network", typePath: "loadBalancers/lb-failover-west-91031", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/loadBalancers" },
      { label: "east-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-failover-east-91031", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "west-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-failover-west-91031", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "east-app", provider: "Microsoft.App", typePath: "containerApps/ca-failover-east-91031", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "west-app", provider: "Microsoft.App", typePath: "containerApps/ca-failover-west-91031", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-failover-91031", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-failover-91031/topics/branch-failover", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-failover-91031/topics/branch-failover/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-failover-91031/topics/branch-failover/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azfailover91031", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azfailover91031/fileServices/default/shares/failover-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-failover-91031", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-failover-91031", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-failover-91031", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-failover-91031", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-failover-91031", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-failover-91031", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "7473b430-82ee-4bdf-85c2-5bd3b6dffb83",
    prId: "Pr91032",
    scenarioId: "compliance-replay-warehouse-bridge",
    title: "Compliance replay warehouse bridge",
    prompt: [
      "Our compliance analytics team wants one Azure deployment that can capture replay events, land them in a warehouse lane, trigger review workflows, and retain both blob and file-based evidence without needing separate stacks. They want the stream ingress, one serverless enrichment surface, one warehouse, one workflow engine, one durable review lane, one transactional history store, and the usual secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Event Hubs namespace with one event hub, one Function App with one App Service plan, one Synapse workspace with one SQL pool, one Logic App workflow, one Service Bus namespace with one topic and one `analytics` subscription and one `compliance` subscription, one Azure Database for PostgreSQL flexible server with one database, one storage account with one blob container and one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-replay-bridge-pulumi-91032`, Event Hubs namespace `eh-replay-91032`, Event Hub `replay-ingest`, Function App plan `plan-replay-91032`, Function App `func-replay-91032`, Synapse workspace `syn-replay-91032`, Synapse SQL pool `replaypool`, Logic App workflow `la-replay-91032`, Service Bus namespace `sb-replay-91032`, Service Bus topic `replay-review`, Service Bus subscription `analytics`, Service Bus subscription `compliance`, PostgreSQL flexible server `pg-replay-91032`, PostgreSQL database `replaydb`, storage account `azreplay91032`, blob container `replay-stage`, Azure Files share `replay-drop`, Redis cache `redis-replay-91032`, Event Grid topic `eg-replay-91032`, Key Vault `kv-replay-91032`, App Configuration store `cfg-replay-91032`, action group `ag-replay-91032`, metric alert `ma-replay-91032`, Log Analytics workspace `log-replay-91032`, and Application Insights component `appi-replay-91032`.",
      "",
      "Keep this focused on the replay and review bridge. Do not add Front Door, API Management, AKS, Cosmos DB, MySQL, Database Migration Service, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ReplayEventHubNamespaceName`, `ReplayEventHubName`, `ReplayFunctionHostName`, `ReplaySynapseWorkspaceName`, `ReplaySqlPoolName`, `ReplayWorkflowName`, `ReplayTopicName`, `ReplayAnalyticsSubscriptionName`, `ReplayComplianceSubscriptionName`, `ReplayPostgresServerName`, `ReplayDatabaseName`, `ReplayBlobContainerName`, `ReplayFileShareName`, `ReplayRedisName`, `ReplayEventGridTopicEndpoint`, `ReplayKeyVaultName`, `ReplayAppConfigName`, `ReplayActionGroupName`, `ReplayMetricAlertName`, `ReplayAppInsightsName`, `ReplayLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Synapse Analytics overview",
        url: "https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is",
        why: "Grounds the warehouse surface and SQL pool hierarchy.",
      },
      {
        title: "Azure Event Hubs overview",
        url: "https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about",
        why: "Grounds the replay stream ingress and durable event retention shape.",
      },
      {
        title: "Azure Logic Apps overview",
        url: "https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-overview",
        why: "Grounds the long-running review workflow surface.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-replay-bridge-pulumi-91032",
      eventHubNamespace: "eh-replay-91032",
      eventHub: "replay-ingest",
      functionAppPlan: "plan-replay-91032",
      functionApp: "func-replay-91032",
      synapseWorkspace: "syn-replay-91032",
      synapseSqlPool: "replaypool",
      logicWorkflow: "la-replay-91032",
      serviceBusNamespace: "sb-replay-91032",
      serviceBusTopic: "replay-review",
      analyticsSubscription: "analytics",
      complianceSubscription: "compliance",
      postgresServer: "pg-replay-91032",
      postgresDatabase: "replaydb",
      storageAccount: "azreplay91032",
      blobContainer: "replay-stage",
      fileShare: "replay-drop",
      redis: "redis-replay-91032",
      eventGridTopic: "eg-replay-91032",
      keyVault: "kv-replay-91032",
      appConfigStore: "cfg-replay-91032",
      actionGroup: "ag-replay-91032",
      metricAlert: "ma-replay-91032",
      logAnalyticsWorkspace: "log-replay-91032",
      applicationInsights: "appi-replay-91032",
    },
    expectedOutputKeys: [
      "ReplayEventHubNamespaceName",
      "ReplayEventHubName",
      "ReplayFunctionHostName",
      "ReplaySynapseWorkspaceName",
      "ReplaySqlPoolName",
      "ReplayWorkflowName",
      "ReplayTopicName",
      "ReplayAnalyticsSubscriptionName",
      "ReplayComplianceSubscriptionName",
      "ReplayPostgresServerName",
      "ReplayDatabaseName",
      "ReplayBlobContainerName",
      "ReplayFileShareName",
      "ReplayRedisName",
      "ReplayEventGridTopicEndpoint",
      "ReplayKeyVaultName",
      "ReplayAppConfigName",
      "ReplayActionGroupName",
      "ReplayMetricAlertName",
      "ReplayAppInsightsName",
      "ReplayLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "eventhub.",
      "web.",
      "synapse.",
      "logic.",
      "servicebus.",
      "dbforpostgresql.",
      "storage.",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "operationalinsights.",
      "replay-stage",
      "replay-drop",
      "replay-review",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbformysql", "datamigration", "private endpoint"],
    integrationChecks: [
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-replay-91032", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-replay-91032/eventhubs/replay-ingest", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-replay-91032", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-replay-91032", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "synapse-workspace", provider: "Microsoft.Synapse", typePath: "workspaces/syn-replay-91032", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces" },
      { label: "synapse-sql-pool", provider: "Microsoft.Synapse", typePath: "workspaces/syn-replay-91032/sqlPools/replaypool", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces/sqlPools" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-replay-91032", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-91032", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-91032/topics/replay-review", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-analytics", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-91032/topics/replay-review/subscriptions/analytics", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-compliance", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-91032/topics/replay-review/subscriptions/compliance", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-replay-91032", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-replay-91032/databases/replaydb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azreplay91032", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azreplay91032/blobServices/default/containers/replay-stage", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azreplay91032/fileServices/default/shares/replay-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-replay-91032", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-replay-91032", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-replay-91032", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-replay-91032", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-replay-91032", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-replay-91032", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-replay-91032", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-replay-91032", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "ce2ba817-70bb-4934-8c98-5b2fb5ed2b22",
    prId: "Pr91033",
    scenarioId: "command-governance-fabric",
    title: "Command governance fabric",
    prompt: [
      "Our command governance team needs one Azure deployment that can accept controlled partner traffic through a managed gateway, run the command handler on a serverless surface, keep a long-lived review workflow, persist mutable state in a globally distributed document store, and retain operational coordination in a durable queue and cache. They also need the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Azure API Management service with one API and one product, one Function App with one App Service plan, one Logic App workflow, one Service Bus namespace with one queue, one Azure Cosmos DB account with one SQL database and one SQL container, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor activity log alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-command-fabric-pulumi-91033`, API Management service `apim-command-fabric-91033`, API Management API `command-fabric-api`, API Management product `command-fabric-product`, Function App plan `plan-command-fabric-91033`, Function App `func-command-fabric-91033`, Logic App workflow `la-command-fabric-91033`, Service Bus namespace `sb-command-fabric-91033`, Service Bus queue `command-review`, Cosmos DB account `cosmos-command-fabric-91033`, Cosmos SQL database `CommandStateDb`, Cosmos SQL container `CommandState`, Redis cache `redis-command-fabric-91033`, Event Grid topic `eg-command-fabric-91033`, Key Vault `kv-command-fabric-91033`, App Configuration store `cfg-command-fabric-91033`, action group `ag-command-fabric-91033`, activity log alert `ala-command-fabric-91033`, Log Analytics workspace `log-command-fabric-91033`, and Application Insights component `appi-command-fabric-91033`.",
      "",
      "Keep this focused on the command governance plane. Do not add Front Door, AKS, MySQL, PostgreSQL, Database Migration Service, Azure Files, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `CommandFabricApiGatewayUrl`, `CommandFabricFunctionHostName`, `CommandFabricWorkflowName`, `CommandFabricQueueName`, `CommandFabricCosmosAccountName`, `CommandFabricCosmosDatabaseName`, `CommandFabricCosmosContainerName`, `CommandFabricRedisName`, `CommandFabricEventGridTopicEndpoint`, `CommandFabricKeyVaultName`, `CommandFabricAppConfigName`, `CommandFabricActionGroupName`, `CommandFabricActivityLogAlertName`, `CommandFabricAppInsightsName`, `CommandFabricLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "API Management landing zone accelerator",
        url: "https://learn.microsoft.com/en-us/azure/api-management/landing-zone-accelerator",
        why: "Grounds the managed API gateway and governance boundary.",
      },
      {
        title: "Azure Cosmos DB overview",
        url: "https://learn.microsoft.com/en-us/azure/cosmos-db/overview",
        why: "Grounds the globally distributed document store used for mutable command state.",
      },
      {
        title: "Azure Logic Apps overview",
        url: "https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-overview",
        why: "Grounds the long-running review workflow surface.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-command-fabric-pulumi-91033",
      apiManagementService: "apim-command-fabric-91033",
      apiManagementApi: "command-fabric-api",
      apiManagementProduct: "command-fabric-product",
      functionAppPlan: "plan-command-fabric-91033",
      functionApp: "func-command-fabric-91033",
      logicWorkflow: "la-command-fabric-91033",
      serviceBusNamespace: "sb-command-fabric-91033",
      serviceBusQueue: "command-review",
      cosmosAccount: "cosmos-command-fabric-91033",
      cosmosDatabase: "CommandStateDb",
      cosmosContainer: "CommandState",
      redis: "redis-command-fabric-91033",
      eventGridTopic: "eg-command-fabric-91033",
      keyVault: "kv-command-fabric-91033",
      appConfigStore: "cfg-command-fabric-91033",
      actionGroup: "ag-command-fabric-91033",
      activityLogAlert: "ala-command-fabric-91033",
      logAnalyticsWorkspace: "log-command-fabric-91033",
      applicationInsights: "appi-command-fabric-91033",
    },
    expectedOutputKeys: [
      "CommandFabricApiGatewayUrl",
      "CommandFabricFunctionHostName",
      "CommandFabricWorkflowName",
      "CommandFabricQueueName",
      "CommandFabricCosmosAccountName",
      "CommandFabricCosmosDatabaseName",
      "CommandFabricCosmosContainerName",
      "CommandFabricRedisName",
      "CommandFabricEventGridTopicEndpoint",
      "CommandFabricKeyVaultName",
      "CommandFabricAppConfigName",
      "CommandFabricActionGroupName",
      "CommandFabricActivityLogAlertName",
      "CommandFabricAppInsightsName",
      "CommandFabricLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement.",
      "web.",
      "logic.",
      "servicebus.Queue",
      "documentdb.",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "command-review",
    ],
    forbiddenSourceMarkers: ["frontdoor", "containerservice", "dbformysql", "dbforpostgresql", "datamigration", "storage.FileShare", "private endpoint"],
    integrationChecks: [
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-command-fabric-91033", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-command-fabric-91033/apis/command-fabric-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-command-fabric-91033/products/command-fabric-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-command-fabric-91033", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-command-fabric-91033", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-command-fabric-91033", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-command-fabric-91033", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-queue", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-command-fabric-91033/queues/command-review", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/queues" },
      { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-command-fabric-91033", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
      { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-command-fabric-91033/sqlDatabases/CommandStateDb", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
      { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-command-fabric-91033/sqlDatabases/CommandStateDb/containers/CommandState", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-command-fabric-91033", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-command-fabric-91033", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-command-fabric-91033", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-command-fabric-91033", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-command-fabric-91033", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-command-fabric-91033", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-command-fabric-91033", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-command-fabric-91033", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "bbe5b485-ce4b-430d-9859-71bdb2cfab28",
    prId: "Pr91034",
    scenarioId: "private-discovery-handoff-fabric",
    title: "Private discovery handoff fabric",
    prompt: [
      "Our internal networking and operations teams need one Azure deployment that can keep two regional service fabrics private, route branch traffic through regional application gateways, resolve internal service names through shared discovery records, hand off file-based artifacts, and keep a durable coordination backbone across both regions. They also need the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
      "",
      "Use one virtual network in `eastus`, one virtual network in `westus2`, one services subnet in each virtual network, one Azure Private DNS zone linked to both virtual networks, one private DNS A record for `gateway.handoff.internal`, one for `workers.handoff.internal`, and one for `files.handoff.internal`, one Application Gateway in each region, one managed Azure Container Apps environment in each region with one gateway app and one worker app in each environment, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription, one storage account with one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-discovery-handoff-pulumi-91034`, east virtual network `vnet-handoff-east-91034`, west virtual network `vnet-handoff-west-91034`, east services subnet `snet-handoff-east-91034`, west services subnet `snet-handoff-west-91034`, private DNS zone `handoff.internal`, private DNS virtual network link `handoff-link-east-91034`, private DNS virtual network link `handoff-link-west-91034`, private DNS A record `gateway.handoff.internal`, private DNS A record `workers.handoff.internal`, private DNS A record `files.handoff.internal`, east Application Gateway `agw-handoff-east-91034`, west Application Gateway `agw-handoff-west-91034`, east Container Apps environment `cae-handoff-east-91034`, west Container Apps environment `cae-handoff-west-91034`, east gateway app `ca-handoff-gateway-east-91034`, west gateway app `ca-handoff-gateway-west-91034`, east worker app `ca-handoff-workers-east-91034`, west worker app `ca-handoff-workers-west-91034`, Service Bus namespace `sb-handoff-91034`, Service Bus topic `handoff-jobs`, Service Bus subscription `east`, Service Bus subscription `west`, storage account `azhandoff91034`, Azure Files share `handoff-drop`, Redis cache `redis-handoff-91034`, Event Grid topic `eg-handoff-91034`, Key Vault `kv-handoff-91034`, App Configuration store `cfg-handoff-91034`, action group `ag-handoff-91034`, metric alert `ma-handoff-91034`, Log Analytics workspace `log-handoff-91034`, and Application Insights component `appi-handoff-91034`.",
      "",
      "Keep everything internal-only in this task. Do not add Front Door, API Management, AKS, MySQL, PostgreSQL, Cosmos DB, Database Migration Service, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `HandoffEastVirtualNetworkName`, `HandoffWestVirtualNetworkName`, `HandoffPrivateDnsZoneName`, `HandoffEastApplicationGatewayName`, `HandoffWestApplicationGatewayName`, `HandoffEastEnvironmentName`, `HandoffWestEnvironmentName`, `HandoffEastGatewayAppName`, `HandoffWestGatewayAppName`, `HandoffEastWorkerAppName`, `HandoffWestWorkerAppName`, `HandoffTopicName`, `HandoffEastSubscriptionName`, `HandoffWestSubscriptionName`, `HandoffFileShareName`, `HandoffRedisName`, `HandoffEventGridTopicEndpoint`, `HandoffKeyVaultName`, `HandoffAppConfigName`, `HandoffActionGroupName`, `HandoffMetricAlertName`, `HandoffAppInsightsName`, `HandoffLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Private DNS zone overview",
        url: "https://learn.microsoft.com/en-us/azure/dns/private-dns-privatednszone",
        why: "Grounds the private discovery namespace and virtual network linking model.",
      },
      {
        title: "What is Azure Application Gateway",
        url: "https://learn.microsoft.com/en-us/azure/application-gateway/overview",
        why: "Grounds the regional layer-7 routing surface for internal traffic.",
      },
      {
        title: "Azure Container Apps overview",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/overview",
        why: "Grounds the internal application environments and private service discovery behavior.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-discovery-handoff-pulumi-91034",
      eastVirtualNetwork: "vnet-handoff-east-91034",
      westVirtualNetwork: "vnet-handoff-west-91034",
      eastServicesSubnet: "snet-handoff-east-91034",
      westServicesSubnet: "snet-handoff-west-91034",
      privateZone: "handoff.internal",
      privateLinkEast: "handoff-link-east-91034",
      privateLinkWest: "handoff-link-west-91034",
      gatewayRecord: "gateway.handoff.internal",
      workersRecord: "workers.handoff.internal",
      filesRecord: "files.handoff.internal",
      eastApplicationGateway: "agw-handoff-east-91034",
      westApplicationGateway: "agw-handoff-west-91034",
      eastManagedEnvironment: "cae-handoff-east-91034",
      westManagedEnvironment: "cae-handoff-west-91034",
      eastGatewayApp: "ca-handoff-gateway-east-91034",
      westGatewayApp: "ca-handoff-gateway-west-91034",
      eastWorkerApp: "ca-handoff-workers-east-91034",
      westWorkerApp: "ca-handoff-workers-west-91034",
      serviceBusNamespace: "sb-handoff-91034",
      serviceBusTopic: "handoff-jobs",
      eastSubscription: "east",
      westSubscription: "west",
      storageAccount: "azhandoff91034",
      fileShare: "handoff-drop",
      redis: "redis-handoff-91034",
      eventGridTopic: "eg-handoff-91034",
      keyVault: "kv-handoff-91034",
      appConfigStore: "cfg-handoff-91034",
      actionGroup: "ag-handoff-91034",
      metricAlert: "ma-handoff-91034",
      logAnalyticsWorkspace: "log-handoff-91034",
      applicationInsights: "appi-handoff-91034",
    },
    expectedOutputKeys: [
      "HandoffEastVirtualNetworkName",
      "HandoffWestVirtualNetworkName",
      "HandoffPrivateDnsZoneName",
      "HandoffEastApplicationGatewayName",
      "HandoffWestApplicationGatewayName",
      "HandoffEastEnvironmentName",
      "HandoffWestEnvironmentName",
      "HandoffEastGatewayAppName",
      "HandoffWestGatewayAppName",
      "HandoffEastWorkerAppName",
      "HandoffWestWorkerAppName",
      "HandoffTopicName",
      "HandoffEastSubscriptionName",
      "HandoffWestSubscriptionName",
      "HandoffFileShareName",
      "HandoffRedisName",
      "HandoffEventGridTopicEndpoint",
      "HandoffKeyVaultName",
      "HandoffAppConfigName",
      "HandoffActionGroupName",
      "HandoffMetricAlertName",
      "HandoffAppInsightsName",
      "HandoffLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "network.VirtualNetwork",
      "network.PrivateZone",
      "network.VirtualNetworkLink",
      "network.ApplicationGateway",
      "app.ManagedEnvironment",
      "app.ContainerApp",
      "servicebus.",
      "storage.FileShare",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "operationalinsights.",
      "handoff.internal",
      "handoff-jobs",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbformysql", "dbforpostgresql", "datamigration", "private endpoint"],
    integrationChecks: [
      { label: "east-virtual-network", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-handoff-east-91034", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-virtual-network", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-handoff-west-91034", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-handoff-east-91034/subnets/snet-handoff-east-91034", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-handoff-west-91034/subnets/snet-handoff-west-91034", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/handoff.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
      { label: "private-dns-link-east", provider: "Microsoft.Network", typePath: "privateDnsZones/handoff.internal/virtualNetworkLinks/handoff-link-east-91034", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "private-dns-link-west", provider: "Microsoft.Network", typePath: "privateDnsZones/handoff.internal/virtualNetworkLinks/handoff-link-west-91034", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "gateway-record", provider: "Microsoft.Network", typePath: "privateDnsZones/handoff.internal/A/gateway", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "workers-record", provider: "Microsoft.Network", typePath: "privateDnsZones/handoff.internal/A/workers", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "files-record", provider: "Microsoft.Network", typePath: "privateDnsZones/handoff.internal/A/files", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "east-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-handoff-east-91034", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "west-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-handoff-west-91034", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "east-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-handoff-east-91034", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "west-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-handoff-west-91034", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "east-gateway-app", provider: "Microsoft.App", typePath: "containerApps/ca-handoff-gateway-east-91034", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "west-gateway-app", provider: "Microsoft.App", typePath: "containerApps/ca-handoff-gateway-west-91034", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "east-worker-app", provider: "Microsoft.App", typePath: "containerApps/ca-handoff-workers-east-91034", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "west-worker-app", provider: "Microsoft.App", typePath: "containerApps/ca-handoff-workers-west-91034", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-handoff-91034", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-handoff-91034/topics/handoff-jobs", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-handoff-91034/topics/handoff-jobs/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-handoff-91034/topics/handoff-jobs/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azhandoff91034", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azhandoff91034/fileServices/default/shares/handoff-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-handoff-91034", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-handoff-91034", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-handoff-91034", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-handoff-91034", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-handoff-91034", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-handoff-91034", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-handoff-91034", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-handoff-91034", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "e4ed0df0-ea2e-43c5-945a-ee1cc05d00ba",
    prId: "Pr91035",
    scenarioId: "global-release-governance-ring",
    title: "Global release governance ring",
    prompt: [
      "Our platform release engineering group needs one Azure deployment that can keep a global release ring online across two regions while preserving regional rollback boundaries. They need two AKS clusters, one shared registry, one regional application gateway per cluster, one global edge in front of those gateways, one shared approval topic with regional and canary subscriptions, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
      "",
      "Use one Azure Front Door profile and endpoint with one security policy and one WAF policy, one Azure Container Registry, one App Configuration store, one virtual network in each region with an application gateway subnet and a workload subnet, one Application Gateway in each region, one AKS cluster in each region, one Key Vault in each region, one Log Analytics workspace in each region, one Application Insights component, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription and one `canary` subscription, one Event Grid topic, one Azure Monitor action group, and one Azure Monitor activity log alert.",
      "",
      "Use these exact resource names: resource group `rg-az-release-ring-pulumi-91035`, Front Door profile `afd-release-ring-91035`, Front Door endpoint `release-ring-endpoint`, Front Door security policy `release-ring-security-policy`, WAF policy `waf-release-ring-91035`, Container Registry `acrreleasering91035`, App Configuration store `cfg-release-ring-91035`, east virtual network `vnet-release-east-91035`, east application gateway subnet `snet-release-agw-east-91035`, east workload subnet `snet-release-aks-east-91035`, east Application Gateway `agw-release-east-91035`, east AKS cluster `aks-release-east-91035`, east Key Vault `kv-release-east-91035`, east Log Analytics workspace `log-release-east-91035`, west virtual network `vnet-release-west-91035`, west application gateway subnet `snet-release-agw-west-91035`, west workload subnet `snet-release-aks-west-91035`, west Application Gateway `agw-release-west-91035`, west AKS cluster `aks-release-west-91035`, west Key Vault `kv-release-west-91035`, west Log Analytics workspace `log-release-west-91035`, Application Insights component `appi-release-ring-91035`, Service Bus namespace `sb-release-ring-91035`, Service Bus topic `release-approvals`, Service Bus subscription `east`, Service Bus subscription `west`, Service Bus subscription `canary`, Event Grid topic `eg-release-ring-91035`, action group `ag-release-ring-91035`, and activity log alert `ala-release-ring-91035`.",
      "",
      "Keep this focused on the release governance ring. Do not add API Management, Functions, Logic Apps, Cosmos DB, MySQL, PostgreSQL, Database Migration Service, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ReleaseRingFrontDoorProfileName`, `ReleaseRingFrontDoorEndpointHostName`, `ReleaseRingRegistryName`, `ReleaseRingAppConfigName`, `ReleaseRingEastVirtualNetworkName`, `ReleaseRingEastApplicationGatewayName`, `ReleaseRingEastClusterName`, `ReleaseRingEastKeyVaultName`, `ReleaseRingEastLogAnalyticsWorkspaceName`, `ReleaseRingWestVirtualNetworkName`, `ReleaseRingWestApplicationGatewayName`, `ReleaseRingWestClusterName`, `ReleaseRingWestKeyVaultName`, `ReleaseRingWestLogAnalyticsWorkspaceName`, `ReleaseRingAppInsightsName`, `ReleaseRingTopicName`, `ReleaseRingEastSubscriptionName`, `ReleaseRingWestSubscriptionName`, `ReleaseRingCanarySubscriptionName`, `ReleaseRingEventGridTopicEndpoint`, `ReleaseRingActionGroupName`, `ReleaseRingActivityLogAlertName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "AKS baseline for multiregion clusters",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
        why: "Grounds the two-cluster regional release topology.",
      },
      {
        title: "Architecture best practices for Azure Front Door",
        url: "https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-front-door",
        why: "Grounds the global edge routing and failover boundary in front of regional origins.",
      },
      {
        title: "Introduction to Azure Container Registry",
        url: "https://learn.microsoft.com/en-us/azure/container-registry/container-registry-intro",
        why: "Grounds the shared image distribution surface for both clusters.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-release-ring-pulumi-91035",
      frontDoorProfile: "afd-release-ring-91035",
      frontDoorEndpoint: "release-ring-endpoint",
      securityPolicy: "release-ring-security-policy",
      wafPolicy: "waf-release-ring-91035",
      registry: "acrreleasering91035",
      appConfigStore: "cfg-release-ring-91035",
      eastVirtualNetwork: "vnet-release-east-91035",
      eastApplicationGatewaySubnet: "snet-release-agw-east-91035",
      eastWorkloadSubnet: "snet-release-aks-east-91035",
      eastApplicationGateway: "agw-release-east-91035",
      eastCluster: "aks-release-east-91035",
      eastKeyVault: "kv-release-east-91035",
      eastLogAnalyticsWorkspace: "log-release-east-91035",
      westVirtualNetwork: "vnet-release-west-91035",
      westApplicationGatewaySubnet: "snet-release-agw-west-91035",
      westWorkloadSubnet: "snet-release-aks-west-91035",
      westApplicationGateway: "agw-release-west-91035",
      westCluster: "aks-release-west-91035",
      westKeyVault: "kv-release-west-91035",
      westLogAnalyticsWorkspace: "log-release-west-91035",
      applicationInsights: "appi-release-ring-91035",
      serviceBusNamespace: "sb-release-ring-91035",
      serviceBusTopic: "release-approvals",
      eastSubscription: "east",
      westSubscription: "west",
      canarySubscription: "canary",
      eventGridTopic: "eg-release-ring-91035",
      actionGroup: "ag-release-ring-91035",
      activityLogAlert: "ala-release-ring-91035",
    },
    expectedOutputKeys: [
      "ReleaseRingFrontDoorProfileName",
      "ReleaseRingFrontDoorEndpointHostName",
      "ReleaseRingRegistryName",
      "ReleaseRingAppConfigName",
      "ReleaseRingEastVirtualNetworkName",
      "ReleaseRingEastApplicationGatewayName",
      "ReleaseRingEastClusterName",
      "ReleaseRingEastKeyVaultName",
      "ReleaseRingEastLogAnalyticsWorkspaceName",
      "ReleaseRingWestVirtualNetworkName",
      "ReleaseRingWestApplicationGatewayName",
      "ReleaseRingWestClusterName",
      "ReleaseRingWestKeyVaultName",
      "ReleaseRingWestLogAnalyticsWorkspaceName",
      "ReleaseRingAppInsightsName",
      "ReleaseRingTopicName",
      "ReleaseRingEastSubscriptionName",
      "ReleaseRingWestSubscriptionName",
      "ReleaseRingCanarySubscriptionName",
      "ReleaseRingEventGridTopicEndpoint",
      "ReleaseRingActionGroupName",
      "ReleaseRingActivityLogAlertName",
    ],
    requiredSourceMarkers: [
      "cdn.",
      "network.WebApplicationFirewallPolicy",
      "containerregistry.",
      "network.VirtualNetwork",
      "network.ApplicationGateway",
      "containerservice.",
      "servicebus.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "release-approvals",
    ],
    forbiddenSourceMarkers: ["apimanagement", "web.", "logic.", "documentdb", "dbformysql", "dbforpostgresql", "datamigration", "private endpoint"],
    integrationChecks: [
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-release-ring-91035", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-release-ring-91035/afdEndpoints/release-ring-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-release-ring-91035/securityPolicies/release-ring-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-release-ring-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrreleasering91035", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-release-ring-91035", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-release-east-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-release-east-91035/subnets/snet-release-agw-east-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-workload-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-release-east-91035/subnets/snet-release-aks-east-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-release-east-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "east-aks", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-release-east-91035", apiVersion: "2024-01-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "east-key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-release-east-91035", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "east-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-release-east-91035", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-release-west-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-release-west-91035/subnets/snet-release-agw-west-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-workload-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-release-west-91035/subnets/snet-release-aks-west-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-release-west-91035", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "west-aks", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-release-west-91035", apiVersion: "2024-01-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "west-key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-release-west-91035", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "west-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-release-west-91035", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-release-ring-91035", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-release-ring-91035", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-release-ring-91035/topics/release-approvals", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-release-ring-91035/topics/release-approvals/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-release-ring-91035/topics/release-approvals/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-canary", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-release-ring-91035/topics/release-approvals/subscriptions/canary", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-release-ring-91035", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-release-ring-91035", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-release-ring-91035", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
    ],
  },
  {
    poId: "90c8cf44-2fef-4916-89d3-a0e37f9a8e14",
    prId: "Pr91036",
    scenarioId: "realtime-warehouse-bridge",
    title: "Realtime warehouse bridge",
    prompt: [
      "Our analytics engineering group needs one Azure deployment that can accept realtime operational events, enrich them on a serverless surface, persist hot state in a globally distributed document store, replay review signals through durable subscriptions, and land curated data into a warehouse lane with both blob and file-based evidence. They also need the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Event Hubs namespace with one event hub, one Function App with one App Service plan, one Synapse workspace with one SQL pool, one Azure Cosmos DB account with one SQL database and one SQL container, one Service Bus namespace with one topic and one `analytics` subscription and one `compliance` subscription, one storage account with one blob container and one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-warehouse-bridge-pulumi-91036`, Event Hubs namespace `eh-warehouse-91036`, Event Hub `warehouse-ingest`, Function App plan `plan-warehouse-91036`, Function App `func-warehouse-91036`, Synapse workspace `syn-warehouse-91036`, Synapse SQL pool `warehousepool`, Cosmos DB account `cosmos-warehouse-91036`, Cosmos SQL database `WarehouseStateDb`, Cosmos SQL container `WarehouseState`, Service Bus namespace `sb-warehouse-91036`, Service Bus topic `warehouse-review`, Service Bus subscription `analytics`, Service Bus subscription `compliance`, storage account `azwarehouse91036`, blob container `warehouse-stage`, Azure Files share `warehouse-drop`, Redis cache `redis-warehouse-91036`, Event Grid topic `eg-warehouse-91036`, Key Vault `kv-warehouse-91036`, App Configuration store `cfg-warehouse-91036`, action group `ag-warehouse-91036`, metric alert `ma-warehouse-91036`, Log Analytics workspace `log-warehouse-91036`, and Application Insights component `appi-warehouse-91036`.",
      "",
      "Keep this focused on the warehouse bridge. Do not add Front Door, API Management, AKS, MySQL, PostgreSQL, Database Migration Service, Logic Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `WarehouseEventHubNamespaceName`, `WarehouseEventHubName`, `WarehouseFunctionHostName`, `WarehouseSynapseWorkspaceName`, `WarehouseSqlPoolName`, `WarehouseCosmosAccountName`, `WarehouseCosmosDatabaseName`, `WarehouseCosmosContainerName`, `WarehouseTopicName`, `WarehouseAnalyticsSubscriptionName`, `WarehouseComplianceSubscriptionName`, `WarehouseBlobContainerName`, `WarehouseFileShareName`, `WarehouseRedisName`, `WarehouseEventGridTopicEndpoint`, `WarehouseKeyVaultName`, `WarehouseAppConfigName`, `WarehouseActionGroupName`, `WarehouseMetricAlertName`, `WarehouseAppInsightsName`, `WarehouseLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Synapse Analytics overview",
        url: "https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is",
        why: "Grounds the warehouse surface and SQL pool hierarchy.",
      },
      {
        title: "Azure Event Hubs overview",
        url: "https://learn.microsoft.com/en-us/azure/event-hubs/event-hubs-about",
        why: "Grounds the realtime ingress and durable streaming surface.",
      },
      {
        title: "Azure Cosmos DB overview",
        url: "https://learn.microsoft.com/en-us/azure/cosmos-db/overview",
        why: "Grounds the globally distributed hot-state store.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-warehouse-bridge-pulumi-91036",
      eventHubNamespace: "eh-warehouse-91036",
      eventHub: "warehouse-ingest",
      functionAppPlan: "plan-warehouse-91036",
      functionApp: "func-warehouse-91036",
      synapseWorkspace: "syn-warehouse-91036",
      synapseSqlPool: "warehousepool",
      cosmosAccount: "cosmos-warehouse-91036",
      cosmosDatabase: "WarehouseStateDb",
      cosmosContainer: "WarehouseState",
      serviceBusNamespace: "sb-warehouse-91036",
      serviceBusTopic: "warehouse-review",
      analyticsSubscription: "analytics",
      complianceSubscription: "compliance",
      storageAccount: "azwarehouse91036",
      blobContainer: "warehouse-stage",
      fileShare: "warehouse-drop",
      redis: "redis-warehouse-91036",
      eventGridTopic: "eg-warehouse-91036",
      keyVault: "kv-warehouse-91036",
      appConfigStore: "cfg-warehouse-91036",
      actionGroup: "ag-warehouse-91036",
      metricAlert: "ma-warehouse-91036",
      logAnalyticsWorkspace: "log-warehouse-91036",
      applicationInsights: "appi-warehouse-91036",
    },
    expectedOutputKeys: [
      "WarehouseEventHubNamespaceName",
      "WarehouseEventHubName",
      "WarehouseFunctionHostName",
      "WarehouseSynapseWorkspaceName",
      "WarehouseSqlPoolName",
      "WarehouseCosmosAccountName",
      "WarehouseCosmosDatabaseName",
      "WarehouseCosmosContainerName",
      "WarehouseTopicName",
      "WarehouseAnalyticsSubscriptionName",
      "WarehouseComplianceSubscriptionName",
      "WarehouseBlobContainerName",
      "WarehouseFileShareName",
      "WarehouseRedisName",
      "WarehouseEventGridTopicEndpoint",
      "WarehouseKeyVaultName",
      "WarehouseAppConfigName",
      "WarehouseActionGroupName",
      "WarehouseMetricAlertName",
      "WarehouseAppInsightsName",
      "WarehouseLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "eventhub.",
      "web.",
      "synapse.",
      "documentdb.",
      "servicebus.",
      "storage.",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "operationalinsights.",
      "warehouse-stage",
      "warehouse-drop",
      "warehouse-review",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "dbformysql", "dbforpostgresql", "datamigration", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-warehouse-91036", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
      { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-warehouse-91036/eventhubs/warehouse-ingest", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-warehouse-91036", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-warehouse-91036", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "synapse-workspace", provider: "Microsoft.Synapse", typePath: "workspaces/syn-warehouse-91036", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces" },
      { label: "synapse-sql-pool", provider: "Microsoft.Synapse", typePath: "workspaces/syn-warehouse-91036/sqlPools/warehousepool", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces/sqlPools" },
      { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-warehouse-91036", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
      { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-warehouse-91036/sqlDatabases/WarehouseStateDb", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
      { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-warehouse-91036/sqlDatabases/WarehouseStateDb/containers/WarehouseState", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91036", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91036/topics/warehouse-review", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-analytics", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91036/topics/warehouse-review/subscriptions/analytics", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-compliance", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-warehouse-91036/topics/warehouse-review/subscriptions/compliance", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azwarehouse91036", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azwarehouse91036/blobServices/default/containers/warehouse-stage", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azwarehouse91036/fileServices/default/shares/warehouse-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-warehouse-91036", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-warehouse-91036", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-warehouse-91036", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-warehouse-91036", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-warehouse-91036", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-warehouse-91036", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-warehouse-91036", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-warehouse-91036", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "93a5c89e-b4f5-45a2-9fa3-99dbcab1e7e0",
    prId: "Pr91037",
    scenarioId: "migration-command-handoff-plane",
    title: "Migration command handoff plane",
    prompt: [
      "Our migration command team needs one Azure deployment that can accept controlled migration requests through a managed API surface, hand execution to containerized workers, keep migration state in a transactional store, run one migration control plane, and preserve both durable fan-out and file-based handoff artifacts. They also need the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one Azure API Management service with one API and one product, one managed Azure Container Apps environment with one command app and one worker app, one Azure Database for MySQL flexible server with one database, one Azure Database Migration Service with one project, one Service Bus namespace with one topic and one `ops` subscription and one `audit` subscription, one storage account with one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-migration-command-pulumi-91037`, API Management service `apim-migration-command-91037`, API Management API `migration-command-api`, API Management product `migration-command-product`, managed environment `cae-migration-command-91037`, command app `ca-migration-command-91037`, worker app `ca-migration-worker-91037`, MySQL flexible server `mysql-migration-command-91037`, MySQL database `migrationdb`, Database Migration Service `dms-migration-command-91037`, Database Migration project `migration-command-project`, Service Bus namespace `sb-migration-command-91037`, Service Bus topic `migration-command`, Service Bus subscription `ops`, Service Bus subscription `audit`, storage account `azmigration91037`, Azure Files share `migration-command-drop`, Redis cache `redis-migration-command-91037`, Event Grid topic `eg-migration-command-91037`, Key Vault `kv-mig-cmd-91037`, App Configuration store `cfg-migration-command-91037`, action group `ag-migration-command-91037`, metric alert `ma-migration-command-91037`, Log Analytics workspace `log-migration-command-91037`, and Application Insights component `appi-migration-command-91037`.",
      "",
      "Keep this focused on the migration command handoff plane. Do not add Front Door, AKS, PostgreSQL, Cosmos DB, Logic Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `MigrationCommandApiGatewayUrl`, `MigrationCommandEnvironmentName`, `MigrationCommandAppName`, `MigrationWorkerAppName`, `MigrationCommandMySqlServerName`, `MigrationCommandDatabaseName`, `MigrationCommandDmsServiceName`, `MigrationCommandDmsProjectName`, `MigrationCommandTopicName`, `MigrationCommandOpsSubscriptionName`, `MigrationCommandAuditSubscriptionName`, `MigrationCommandFileShareName`, `MigrationCommandRedisName`, `MigrationCommandEventGridTopicEndpoint`, `MigrationCommandKeyVaultName`, `MigrationCommandAppConfigName`, `MigrationCommandActionGroupName`, `MigrationCommandMetricAlertName`, `MigrationCommandAppInsightsName`, `MigrationCommandLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure Database Migration Service overview",
        url: "https://learn.microsoft.com/en-us/azure/dms/dms-overview",
        why: "Grounds the migration control-plane surface and project hierarchy.",
      },
      {
        title: "Azure Database for MySQL flexible server overview",
        url: "https://learn.microsoft.com/en-us/azure/mysql/flexible-server/overview",
        why: "Grounds the transactional migration state store.",
      },
      {
        title: "Azure Container Apps overview",
        url: "https://learn.microsoft.com/en-us/azure/container-apps/overview",
        why: "Grounds the containerized command and worker execution surfaces.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-migration-command-pulumi-91037",
      apiManagementService: "apim-migration-command-91037",
      apiManagementApi: "migration-command-api",
      apiManagementProduct: "migration-command-product",
      managedEnvironment: "cae-migration-command-91037",
      commandApp: "ca-migration-command-91037",
      workerApp: "ca-migration-worker-91037",
      mysqlServer: "mysql-migration-command-91037",
      mysqlDatabase: "migrationdb",
      dmsService: "dms-migration-command-91037",
      dmsProject: "migration-command-project",
      serviceBusNamespace: "sb-migration-command-91037",
      serviceBusTopic: "migration-command",
      opsSubscription: "ops",
      auditSubscription: "audit",
      storageAccount: "azmigration91037",
      fileShare: "migration-command-drop",
      redis: "redis-migration-command-91037",
      eventGridTopic: "eg-migration-command-91037",
      keyVault: "kv-mig-cmd-91037",
      appConfigStore: "cfg-migration-command-91037",
      actionGroup: "ag-migration-command-91037",
      metricAlert: "ma-migration-command-91037",
      logAnalyticsWorkspace: "log-migration-command-91037",
      applicationInsights: "appi-migration-command-91037",
    },
    expectedOutputKeys: [
      "MigrationCommandApiGatewayUrl",
      "MigrationCommandEnvironmentName",
      "MigrationCommandAppName",
      "MigrationWorkerAppName",
      "MigrationCommandMySqlServerName",
      "MigrationCommandDatabaseName",
      "MigrationCommandDmsServiceName",
      "MigrationCommandDmsProjectName",
      "MigrationCommandTopicName",
      "MigrationCommandOpsSubscriptionName",
      "MigrationCommandAuditSubscriptionName",
      "MigrationCommandFileShareName",
      "MigrationCommandRedisName",
      "MigrationCommandEventGridTopicEndpoint",
      "MigrationCommandKeyVaultName",
      "MigrationCommandAppConfigName",
      "MigrationCommandActionGroupName",
      "MigrationCommandMetricAlertName",
      "MigrationCommandAppInsightsName",
      "MigrationCommandLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement.",
      "app.ManagedEnvironment",
      "app.ContainerApp",
      "dbformysql.",
      "datamigration.",
      "servicebus.",
      "storage.FileShare",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "operationalinsights.",
      "migration-command",
      "migration-command-drop",
    ],
    forbiddenSourceMarkers: ["frontdoor", "containerservice", "dbforpostgresql", "documentdb", "logic.", "private endpoint"],
    integrationChecks: [
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-migration-command-91037", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-migration-command-91037/apis/migration-command-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-migration-command-91037/products/migration-command-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-migration-command-91037", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "command-app", provider: "Microsoft.App", typePath: "containerApps/ca-migration-command-91037", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "worker-app", provider: "Microsoft.App", typePath: "containerApps/ca-migration-worker-91037", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-migration-command-91037", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-migration-command-91037/databases/migrationdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-migration-command-91037", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
      { label: "dms-project", provider: "Microsoft.DataMigration", typePath: "services/dms-migration-command-91037/projects/migration-command-project", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-migration-command-91037", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-migration-command-91037/topics/migration-command", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-ops", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-migration-command-91037/topics/migration-command/subscriptions/ops", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-audit", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-migration-command-91037/topics/migration-command/subscriptions/audit", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azmigration91037", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azmigration91037/fileServices/default/shares/migration-command-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-migration-command-91037", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-migration-command-91037", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-mig-cmd-91037", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-migration-command-91037", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-migration-command-91037", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-migration-command-91037", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-migration-command-91037", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-migration-command-91037", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "f1c774cb-d8b6-444c-8a7c-e2c789ed6fd0",
    prId: "Pr91038",
    scenarioId: "multiregion-serving-governance-ring",
    title: "Multiregion serving governance ring",
    prompt: [
      "Our model-serving governance group needs one Azure deployment that can keep a global control surface live across two regions while preserving explicit promotion and rollback boundaries. They need a global edge in front of regional origins, a managed partner API for release commands, two regional AKS clusters, a shared registry and identity plane, a public DNS handoff for the control endpoint, and durable approval fan-out with the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
      "",
      "Use one Azure Front Door profile with one endpoint, one origin group, one east origin, one west origin, one route, one security policy, and one WAF policy, one Azure public DNS zone with one CNAME record for the control endpoint, one Azure Container Registry, one user-assigned managed identity, one virtual network in each region with one application gateway subnet and one workload subnet, one public IP address and one Application Gateway in each region, one AKS cluster in each region, one API Management service with one API and one product and one product API association and one `promote-ring` operation with one operation policy, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription and one `rollback` subscription, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, one Log Analytics workspace in each region, and one Application Insights component.",
      "",
      "Use these exact resource names: resource group `rg-az-serving-gov-pulumi-91038`, Front Door profile `afd-serving-gov-91038`, Front Door endpoint `serving-gov-endpoint`, Front Door origin group `serving-gov-origins`, Front Door east origin `east-gateway`, Front Door west origin `west-gateway`, Front Door route `serving-gov-route`, Front Door security policy `serving-gov-security-policy`, WAF policy `waf-serving-gov-91038`, public DNS zone `serving91038.contoso.net`, public DNS CNAME record `api.serving91038.contoso.net`, Container Registry `acrservinggov91038`, managed identity `id-serving-gov-91038`, east virtual network `vnet-serving-east-91038`, east application gateway subnet `snet-serving-agw-east-91038`, east workload subnet `snet-serving-aks-east-91038`, east public IP `pip-serving-east-91038`, east Application Gateway `agw-serving-east-91038`, east AKS cluster `aks-serving-east-91038`, west virtual network `vnet-serving-west-91038`, west application gateway subnet `snet-serving-agw-west-91038`, west workload subnet `snet-serving-aks-west-91038`, west public IP `pip-serving-west-91038`, west Application Gateway `agw-serving-west-91038`, west AKS cluster `aks-serving-west-91038`, API Management service `apim-serving-gov-91038`, API Management API `serving-gov-api`, API Management product `serving-gov-product`, API Management operation `promote-ring`, Service Bus namespace `sb-serving-gov-91038`, Service Bus topic `serving-governance`, Service Bus subscription `east`, Service Bus subscription `west`, Service Bus subscription `rollback`, Event Grid topic `eg-serving-gov-91038`, Key Vault `kv-serving-gov-91038`, App Configuration store `cfg-serving-gov-91038`, action group `ag-serving-gov-91038`, metric alert `ma-serving-gov-91038`, activity log alert `ala-serving-gov-91038`, east Log Analytics workspace `log-serving-east-91038`, west Log Analytics workspace `log-serving-west-91038`, and Application Insights component `appi-serving-gov-91038`.",
      "",
      "Keep this focused on the serving governance ring. Do not add Functions, Logic Apps, Cosmos DB, MySQL, PostgreSQL, Database Migration Service, Azure Files, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ServingGovFrontDoorProfileName`, `ServingGovFrontDoorEndpointHostName`, `ServingGovOriginGroupName`, `ServingGovRouteName`, `ServingGovSecurityPolicyName`, `ServingGovPublicDnsZoneName`, `ServingGovPublicDnsRecordName`, `ServingGovRegistryName`, `ServingGovManagedIdentityName`, `ServingGovEastApplicationGatewayName`, `ServingGovEastClusterName`, `ServingGovWestApplicationGatewayName`, `ServingGovWestClusterName`, `ServingGovApiGatewayUrl`, `ServingGovTopicName`, `ServingGovEastSubscriptionName`, `ServingGovWestSubscriptionName`, `ServingGovRollbackSubscriptionName`, `ServingGovEventGridTopicEndpoint`, `ServingGovKeyVaultName`, `ServingGovAppConfigName`, `ServingGovActionGroupName`, `ServingGovMetricAlertName`, `ServingGovActivityLogAlertName`, `ServingGovEastLogAnalyticsWorkspaceName`, `ServingGovWestLogAnalyticsWorkspaceName`, `ServingGovAppInsightsName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "AKS baseline for multiregion clusters",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
        why: "Grounds the two-cluster regional topology and shared control surfaces.",
      },
      {
        title: "Configure Azure Front Door in front of Azure API Management",
        url: "https://learn.microsoft.com/en-us/azure/api-management/front-door-api-management",
        why: "Grounds the managed API gateway behind the global edge layer.",
      },
      {
        title: "What is Azure Web Application Firewall on Azure Front Door?",
        url: "https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/afds-overview",
        why: "Grounds the security policy and WAF boundary at the edge.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-serving-gov-pulumi-91038",
      frontDoorProfile: "afd-serving-gov-91038",
      frontDoorEndpoint: "serving-gov-endpoint",
      frontDoorOriginGroup: "serving-gov-origins",
      frontDoorEastOrigin: "east-gateway",
      frontDoorWestOrigin: "west-gateway",
      frontDoorRoute: "serving-gov-route",
      securityPolicy: "serving-gov-security-policy",
      wafPolicy: "waf-serving-gov-91038",
      publicDnsZone: "serving91038.contoso.net",
      publicDnsRecord: "api",
      registry: "acrservinggov91038",
      managedIdentity: "id-serving-gov-91038",
      eastVirtualNetwork: "vnet-serving-east-91038",
      eastApplicationGatewaySubnet: "snet-serving-agw-east-91038",
      eastWorkloadSubnet: "snet-serving-aks-east-91038",
      eastPublicIp: "pip-serving-east-91038",
      eastApplicationGateway: "agw-serving-east-91038",
      eastCluster: "aks-serving-east-91038",
      westVirtualNetwork: "vnet-serving-west-91038",
      westApplicationGatewaySubnet: "snet-serving-agw-west-91038",
      westWorkloadSubnet: "snet-serving-aks-west-91038",
      westPublicIp: "pip-serving-west-91038",
      westApplicationGateway: "agw-serving-west-91038",
      westCluster: "aks-serving-west-91038",
      apiManagementService: "apim-serving-gov-91038",
      apiManagementApi: "serving-gov-api",
      apiManagementProduct: "serving-gov-product",
      apiManagementOperation: "promote-ring",
      serviceBusNamespace: "sb-serving-gov-91038",
      serviceBusTopic: "serving-governance",
      eastSubscription: "east",
      westSubscription: "west",
      rollbackSubscription: "rollback",
      eventGridTopic: "eg-serving-gov-91038",
      keyVault: "kv-serving-gov-91038",
      appConfigStore: "cfg-serving-gov-91038",
      actionGroup: "ag-serving-gov-91038",
      metricAlert: "ma-serving-gov-91038",
      activityLogAlert: "ala-serving-gov-91038",
      eastLogAnalyticsWorkspace: "log-serving-east-91038",
      westLogAnalyticsWorkspace: "log-serving-west-91038",
      applicationInsights: "appi-serving-gov-91038",
    },
    expectedOutputKeys: [
      "ServingGovFrontDoorProfileName",
      "ServingGovFrontDoorEndpointHostName",
      "ServingGovOriginGroupName",
      "ServingGovRouteName",
      "ServingGovSecurityPolicyName",
      "ServingGovPublicDnsZoneName",
      "ServingGovPublicDnsRecordName",
      "ServingGovRegistryName",
      "ServingGovManagedIdentityName",
      "ServingGovEastApplicationGatewayName",
      "ServingGovEastClusterName",
      "ServingGovWestApplicationGatewayName",
      "ServingGovWestClusterName",
      "ServingGovApiGatewayUrl",
      "ServingGovTopicName",
      "ServingGovEastSubscriptionName",
      "ServingGovWestSubscriptionName",
      "ServingGovRollbackSubscriptionName",
      "ServingGovEventGridTopicEndpoint",
      "ServingGovKeyVaultName",
      "ServingGovAppConfigName",
      "ServingGovActionGroupName",
      "ServingGovMetricAlertName",
      "ServingGovActivityLogAlertName",
      "ServingGovEastLogAnalyticsWorkspaceName",
      "ServingGovWestLogAnalyticsWorkspaceName",
      "ServingGovAppInsightsName",
    ],
    requiredSourceMarkers: [
      "cdn.",
      "network.WebApplicationFirewallPolicy",
      "network.Zone",
      "network.RecordSet",
      "containerregistry.",
      "managedidentity.",
      "network.PublicIPAddress",
      "network.VirtualNetwork",
      "network.ApplicationGateway",
      "containerservice.",
      "apimanagement.",
      "servicebus.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "serving-governance",
      "promote-ring",
    ],
    forbiddenSourceMarkers: ["web.", "logic.", "documentdb", "dbformysql", "dbforpostgresql", "datamigration", "storage.FileShare", "private endpoint"],
    integrationChecks: [
      { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
      { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038/afdEndpoints/serving-gov-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
      { label: "front-door-origin-group", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038/originGroups/serving-gov-origins", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/originGroups" },
      { label: "front-door-origin-east", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038/originGroups/serving-gov-origins/origins/east-gateway", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/originGroups/origins" },
      { label: "front-door-origin-west", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038/originGroups/serving-gov-origins/origins/west-gateway", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/originGroups/origins" },
      { label: "front-door-route", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038/afdEndpoints/serving-gov-endpoint/routes/serving-gov-route", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints/routes" },
      { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-serving-gov-91038/securityPolicies/serving-gov-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
      { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-serving-gov-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
      { label: "public-dns-zone", provider: "Microsoft.Network", typePath: "dnsZones/serving91038.contoso.net", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones" },
      { label: "public-dns-record", provider: "Microsoft.Network", typePath: "dnsZones/serving91038.contoso.net/CNAME/api", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/CNAME" },
      { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrservinggov91038", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
      { label: "managed-identity", provider: "Microsoft.ManagedIdentity", typePath: "userAssignedIdentities/id-serving-gov-91038", apiVersion: "2023-01-31", expectedType: "Microsoft.ManagedIdentity/userAssignedIdentities" },
      { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-serving-east-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-serving-east-91038/subnets/snet-serving-agw-east-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-workload-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-serving-east-91038/subnets/snet-serving-aks-east-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "east-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-serving-east-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
      { label: "east-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-serving-east-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "east-aks", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-serving-east-91038", apiVersion: "2024-01-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-serving-west-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-serving-west-91038/subnets/snet-serving-agw-west-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-workload-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-serving-west-91038/subnets/snet-serving-aks-west-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-serving-west-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
      { label: "west-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-serving-west-91038", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
      { label: "west-aks", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-serving-west-91038", apiVersion: "2024-01-01", expectedType: "Microsoft.ContainerService/managedClusters" },
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-serving-gov-91038", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-serving-gov-91038/apis/serving-gov-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-serving-gov-91038/products/serving-gov-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "api-management-product-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-serving-gov-91038/products/serving-gov-product/apis/serving-gov-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products/apis" },
      { label: "api-management-operation", provider: "Microsoft.ApiManagement", typePath: "service/apim-serving-gov-91038/apis/serving-gov-api/operations/promote-ring", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations" },
      { label: "api-management-operation-policy", provider: "Microsoft.ApiManagement", typePath: "service/apim-serving-gov-91038/apis/serving-gov-api/operations/promote-ring/policies/policy", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations/policies" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-gov-91038", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-gov-91038/topics/serving-governance", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-gov-91038/topics/serving-governance/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-gov-91038/topics/serving-governance/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-rollback", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-serving-gov-91038/topics/serving-governance/subscriptions/rollback", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-serving-gov-91038", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-serving-gov-91038", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-serving-gov-91038", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-serving-gov-91038", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-serving-gov-91038", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-serving-gov-91038", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "east-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-serving-east-91038", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "west-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-serving-west-91038", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-serving-gov-91038", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "d2f52191-eba9-4165-a837-0f7bbd53d684",
    prId: "Pr91039",
    scenarioId: "dual-engine-cutover-governance-plane",
    title: "Dual engine cutover governance plane",
    prompt: [
      "Our modernization control office needs one Azure deployment that can accept operator cutover requests through a managed API, validate and enrich them on a serverless surface, hold long-running approval state in a workflow, and keep two migration lanes ready at the same time for MySQL and PostgreSQL workloads. They also need durable command fan-out, blob and file-based evidence handoff, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
      "",
      "Use one API Management service with one API and one product and one product API association and one `start-cutover` operation with one operation policy, one Function App with one App Service plan, one Logic App workflow, one Azure Database for MySQL flexible server with one database, one Azure Database for PostgreSQL flexible server with one database, one Database Migration Service with one `mysql-cutover-project` project and one `postgres-cutover-project` project, one Service Bus namespace with one topic and one `ops` subscription and one `audit` subscription, one storage account with one blob container and one Azure Files share, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-dual-cutover-pulumi-91039`, API Management service `apim-dual-cutover-91039`, API Management API `dual-cutover-api`, API Management product `dual-cutover-product`, API Management operation `start-cutover`, Function App plan `plan-dual-cutover-91039`, Function App `func-dual-cutover-91039`, Logic App workflow `la-dual-cutover-91039`, MySQL flexible server `mysql-dual-cutover-91039`, MySQL database `billingdb`, PostgreSQL flexible server `pg-dual-cutover-91039`, PostgreSQL database `ledgerdb`, Database Migration Service `dms-dual-cutover-91039`, Database Migration project `mysql-cutover-project`, Database Migration project `postgres-cutover-project`, Service Bus namespace `sb-dual-cutover-91039`, Service Bus topic `cutover-commands`, Service Bus subscription `ops`, Service Bus subscription `audit`, storage account `azdualcutover91039`, blob container `cutover-staging`, Azure Files share `cutover-evidence`, Event Grid topic `eg-dual-cutover-91039`, Key Vault `kv-dual-cutover-91039`, App Configuration store `cfg-dual-cutover-91039`, action group `ag-dual-cutover-91039`, metric alert `ma-dual-cutover-91039`, activity log alert `ala-dual-cutover-91039`, Log Analytics workspace `log-dual-cutover-91039`, and Application Insights component `appi-dual-cutover-91039`.",
      "",
      "Keep this focused on the dual-engine cutover plane. Do not add Front Door, AKS, Cosmos DB, Redis, Synapse, Container Apps, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `DualCutoverApiGatewayUrl`, `DualCutoverFunctionHostName`, `DualCutoverWorkflowName`, `DualCutoverMySqlServerName`, `DualCutoverMySqlDatabaseName`, `DualCutoverPostgresServerName`, `DualCutoverPostgresDatabaseName`, `DualCutoverDmsServiceName`, `DualCutoverMySqlProjectName`, `DualCutoverPostgresProjectName`, `DualCutoverTopicName`, `DualCutoverOpsSubscriptionName`, `DualCutoverAuditSubscriptionName`, `DualCutoverBlobContainerName`, `DualCutoverFileShareName`, `DualCutoverEventGridTopicEndpoint`, `DualCutoverKeyVaultName`, `DualCutoverAppConfigName`, `DualCutoverActionGroupName`, `DualCutoverMetricAlertName`, `DualCutoverActivityLogAlertName`, `DualCutoverAppInsightsName`, `DualCutoverLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "What is the migration service in Azure Database for PostgreSQL?",
        url: "https://learn.microsoft.com/en-us/azure/postgresql/migrate/migration-service/overview-migration-service-postgresql",
        why: "Grounds the managed cutover workflow for PostgreSQL migrations.",
      },
      {
        title: "What is Azure Database for MySQL - Flexible Server?",
        url: "https://learn.microsoft.com/en-us/azure/mysql/single-server/overview",
        why: "Grounds the MySQL transactional target surface and server hierarchy.",
      },
      {
        title: "Respond to Azure Service Bus events received using Azure Event Grid by using Azure Logic Apps",
        url: "https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-to-event-grid-integration-example",
        why: "Grounds the durable command and workflow handoff pattern.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-dual-cutover-pulumi-91039",
      apiManagementService: "apim-dual-cutover-91039",
      apiManagementApi: "dual-cutover-api",
      apiManagementProduct: "dual-cutover-product",
      apiManagementOperation: "start-cutover",
      functionAppPlan: "plan-dual-cutover-91039",
      functionApp: "func-dual-cutover-91039",
      logicWorkflow: "la-dual-cutover-91039",
      mysqlServer: "mysql-dual-cutover-91039",
      mysqlDatabase: "billingdb",
      postgresServer: "pg-dual-cutover-91039",
      postgresDatabase: "ledgerdb",
      dmsService: "dms-dual-cutover-91039",
      dmsMySqlProject: "mysql-cutover-project",
      dmsPostgresProject: "postgres-cutover-project",
      serviceBusNamespace: "sb-dual-cutover-91039",
      serviceBusTopic: "cutover-commands",
      opsSubscription: "ops",
      auditSubscription: "audit",
      storageAccount: "azdualcutover91039",
      blobContainer: "cutover-staging",
      fileShare: "cutover-evidence",
      eventGridTopic: "eg-dual-cutover-91039",
      keyVault: "kv-dual-cutover-91039",
      appConfigStore: "cfg-dual-cutover-91039",
      actionGroup: "ag-dual-cutover-91039",
      metricAlert: "ma-dual-cutover-91039",
      activityLogAlert: "ala-dual-cutover-91039",
      logAnalyticsWorkspace: "log-dual-cutover-91039",
      applicationInsights: "appi-dual-cutover-91039",
    },
    expectedOutputKeys: [
      "DualCutoverApiGatewayUrl",
      "DualCutoverFunctionHostName",
      "DualCutoverWorkflowName",
      "DualCutoverMySqlServerName",
      "DualCutoverMySqlDatabaseName",
      "DualCutoverPostgresServerName",
      "DualCutoverPostgresDatabaseName",
      "DualCutoverDmsServiceName",
      "DualCutoverMySqlProjectName",
      "DualCutoverPostgresProjectName",
      "DualCutoverTopicName",
      "DualCutoverOpsSubscriptionName",
      "DualCutoverAuditSubscriptionName",
      "DualCutoverBlobContainerName",
      "DualCutoverFileShareName",
      "DualCutoverEventGridTopicEndpoint",
      "DualCutoverKeyVaultName",
      "DualCutoverAppConfigName",
      "DualCutoverActionGroupName",
      "DualCutoverMetricAlertName",
      "DualCutoverActivityLogAlertName",
      "DualCutoverAppInsightsName",
      "DualCutoverLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "apimanagement.",
      "web.",
      "logic.",
      "dbformysql.",
      "dbforpostgresql.",
      "datamigration.",
      "servicebus.",
      "storage.",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "mysql-cutover-project",
      "postgres-cutover-project",
      "start-cutover",
    ],
    forbiddenSourceMarkers: ["frontdoor", "containerservice", "documentdb", "cache.Redis", "synapse.", "app.ManagedEnvironment", "private endpoint"],
    integrationChecks: [
      { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-dual-cutover-91039", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
      { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-dual-cutover-91039/apis/dual-cutover-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
      { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-dual-cutover-91039/products/dual-cutover-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
      { label: "api-management-product-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-dual-cutover-91039/products/dual-cutover-product/apis/dual-cutover-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products/apis" },
      { label: "api-management-operation", provider: "Microsoft.ApiManagement", typePath: "service/apim-dual-cutover-91039/apis/dual-cutover-api/operations/start-cutover", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations" },
      { label: "api-management-operation-policy", provider: "Microsoft.ApiManagement", typePath: "service/apim-dual-cutover-91039/apis/dual-cutover-api/operations/start-cutover/policies/policy", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations/policies" },
      { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-dual-cutover-91039", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
      { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-dual-cutover-91039", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
      { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-dual-cutover-91039", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
      { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-dual-cutover-91039", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
      { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-dual-cutover-91039/databases/billingdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
      { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-dual-cutover-91039", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
      { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-dual-cutover-91039/databases/ledgerdb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
      { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-dual-cutover-91039", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
      { label: "dms-project-mysql", provider: "Microsoft.DataMigration", typePath: "services/dms-dual-cutover-91039/projects/mysql-cutover-project", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "dms-project-postgres", provider: "Microsoft.DataMigration", typePath: "services/dms-dual-cutover-91039/projects/postgres-cutover-project", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-dual-cutover-91039", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-dual-cutover-91039/topics/cutover-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-ops", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-dual-cutover-91039/topics/cutover-commands/subscriptions/ops", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-audit", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-dual-cutover-91039/topics/cutover-commands/subscriptions/audit", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azdualcutover91039", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azdualcutover91039/blobServices/default/containers/cutover-staging", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azdualcutover91039/fileServices/default/shares/cutover-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-dual-cutover-91039", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-dual-cutover-91039", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-dual-cutover-91039", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-dual-cutover-91039", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-dual-cutover-91039", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-dual-cutover-91039", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-dual-cutover-91039", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-dual-cutover-91039", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
  {
    poId: "92775175-6438-468c-9dd0-311de2ea4d48",
    prId: "Pr91040",
    scenarioId: "branch-public-private-discovery-plane",
    title: "Branch public private discovery plane",
    prompt: [
      "Our branch operations platform team needs one Azure deployment that can keep east and west regional dispatch surfaces reachable through public and private names at the same time. They need two regional virtual networks, public addresses and load balancers for branch ingress, private discovery records for internal services, regional app environments, a shared file handoff area, fast shared state, and a durable dispatch backbone with the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
      "",
      "Use one virtual network in each region with one services subnet in each virtual network, one public DNS zone with one `east` A record and one `west` A record, one Azure Private DNS zone linked to both virtual networks with one `gateway.branch.internal` A record and one `workers.branch.internal` A record and one `files.branch.internal` A record, one public IP address and one Load Balancer in each region, one managed Azure Container Apps environment in each region with one gateway app and one worker app in each environment, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription, one storage account with one Azure Files share, one Azure Cache for Redis, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, and Log Analytics plus Application Insights for telemetry.",
      "",
      "Use these exact resource names: resource group `rg-az-branch-plane-pulumi-91040`, east virtual network `vnet-branch-east-91040`, west virtual network `vnet-branch-west-91040`, east services subnet `snet-branch-east-91040`, west services subnet `snet-branch-west-91040`, public DNS zone `branch91040.contoso.net`, public DNS A record `east.branch91040.contoso.net`, public DNS A record `west.branch91040.contoso.net`, private DNS zone `branch.internal`, private DNS virtual network link `branch-link-east-91040`, private DNS virtual network link `branch-link-west-91040`, private DNS A record `gateway.branch.internal`, private DNS A record `workers.branch.internal`, private DNS A record `files.branch.internal`, east public IP `pip-branch-east-91040`, west public IP `pip-branch-west-91040`, east Load Balancer `lb-branch-east-91040`, west Load Balancer `lb-branch-west-91040`, east Container Apps environment `cae-branch-east-91040`, west Container Apps environment `cae-branch-west-91040`, east gateway app `ca-branch-gateway-east-91040`, west gateway app `ca-branch-gateway-west-91040`, east worker app `ca-branch-workers-east-91040`, west worker app `ca-branch-workers-west-91040`, Service Bus namespace `sb-branch-plane-91040`, Service Bus topic `branch-dispatch`, Service Bus subscription `east`, Service Bus subscription `west`, storage account `azbranchplane91040`, Azure Files share `branch-drop`, Redis cache `redis-branch-plane-91040`, Event Grid topic `eg-branch-plane-91040`, Key Vault `kv-branch-plane-91040`, App Configuration store `cfg-branch-plane-91040`, action group `ag-branch-plane-91040`, metric alert `ma-branch-plane-91040`, activity log alert `ala-branch-plane-91040`, Log Analytics workspace `log-branch-plane-91040`, and Application Insights component `appi-branch-plane-91040`.",
      "",
      "Keep this focused on the branch dispatch plane. Do not add Front Door, API Management, AKS, MySQL, PostgreSQL, Cosmos DB, Database Migration Service, or private endpoints.",
      "",
      "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `BranchPlaneEastVirtualNetworkName`, `BranchPlaneWestVirtualNetworkName`, `BranchPlanePublicDnsZoneName`, `BranchPlanePrivateDnsZoneName`, `BranchPlaneEastPublicIpName`, `BranchPlaneWestPublicIpName`, `BranchPlaneEastLoadBalancerName`, `BranchPlaneWestLoadBalancerName`, `BranchPlaneEastEnvironmentName`, `BranchPlaneWestEnvironmentName`, `BranchPlaneEastGatewayAppName`, `BranchPlaneWestGatewayAppName`, `BranchPlaneEastWorkerAppName`, `BranchPlaneWestWorkerAppName`, `BranchPlaneTopicName`, `BranchPlaneEastSubscriptionName`, `BranchPlaneWestSubscriptionName`, `BranchPlaneFileShareName`, `BranchPlaneRedisName`, `BranchPlaneEventGridTopicEndpoint`, `BranchPlaneKeyVaultName`, `BranchPlaneAppConfigName`, `BranchPlaneActionGroupName`, `BranchPlaneMetricAlertName`, `BranchPlaneActivityLogAlertName`, `BranchPlaneAppInsightsName`, `BranchPlaneLogAnalyticsWorkspaceName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
    ].join("\n"),
    fieldReferences: [
      {
        title: "Azure enterprise cloud file share",
        url: "https://learn.microsoft.com/en-us/azure/architecture/hybrid/azure-files-private",
        why: "Grounds the shared file handoff and private name resolution pattern.",
      },
      {
        title: "Azure Private DNS zone overview",
        url: "https://learn.microsoft.com/en-us/azure/dns/private-dns-privatednszone",
        why: "Grounds the private discovery namespace and virtual network links.",
      },
      {
        title: "Multi-region load balancing with Traffic Manager, Azure Firewall, and Application Gateway",
        url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/n-tier/multi-region-sql-server",
        why: "Grounds the split public ingress and regional load-balancing model.",
      },
    ],
    resourceNames: {
      resourceGroup: "rg-az-branch-plane-pulumi-91040",
      eastVirtualNetwork: "vnet-branch-east-91040",
      westVirtualNetwork: "vnet-branch-west-91040",
      eastSubnet: "snet-branch-east-91040",
      westSubnet: "snet-branch-west-91040",
      publicDnsZone: "branch91040.contoso.net",
      publicEastRecord: "east",
      publicWestRecord: "west",
      privateDnsZone: "branch.internal",
      privateDnsLinkEast: "branch-link-east-91040",
      privateDnsLinkWest: "branch-link-west-91040",
      eastPublicIp: "pip-branch-east-91040",
      westPublicIp: "pip-branch-west-91040",
      eastLoadBalancer: "lb-branch-east-91040",
      westLoadBalancer: "lb-branch-west-91040",
      eastEnvironment: "cae-branch-east-91040",
      westEnvironment: "cae-branch-west-91040",
      eastGatewayApp: "ca-branch-gateway-east-91040",
      westGatewayApp: "ca-branch-gateway-west-91040",
      eastWorkerApp: "ca-branch-workers-east-91040",
      westWorkerApp: "ca-branch-workers-west-91040",
      serviceBusNamespace: "sb-branch-plane-91040",
      serviceBusTopic: "branch-dispatch",
      eastSubscription: "east",
      westSubscription: "west",
      storageAccount: "azbranchplane91040",
      fileShare: "branch-drop",
      redis: "redis-branch-plane-91040",
      eventGridTopic: "eg-branch-plane-91040",
      keyVault: "kv-branch-plane-91040",
      appConfigStore: "cfg-branch-plane-91040",
      actionGroup: "ag-branch-plane-91040",
      metricAlert: "ma-branch-plane-91040",
      activityLogAlert: "ala-branch-plane-91040",
      logAnalyticsWorkspace: "log-branch-plane-91040",
      applicationInsights: "appi-branch-plane-91040",
    },
    expectedOutputKeys: [
      "BranchPlaneEastVirtualNetworkName",
      "BranchPlaneWestVirtualNetworkName",
      "BranchPlanePublicDnsZoneName",
      "BranchPlanePrivateDnsZoneName",
      "BranchPlaneEastPublicIpName",
      "BranchPlaneWestPublicIpName",
      "BranchPlaneEastLoadBalancerName",
      "BranchPlaneWestLoadBalancerName",
      "BranchPlaneEastEnvironmentName",
      "BranchPlaneWestEnvironmentName",
      "BranchPlaneEastGatewayAppName",
      "BranchPlaneWestGatewayAppName",
      "BranchPlaneEastWorkerAppName",
      "BranchPlaneWestWorkerAppName",
      "BranchPlaneTopicName",
      "BranchPlaneEastSubscriptionName",
      "BranchPlaneWestSubscriptionName",
      "BranchPlaneFileShareName",
      "BranchPlaneRedisName",
      "BranchPlaneEventGridTopicEndpoint",
      "BranchPlaneKeyVaultName",
      "BranchPlaneAppConfigName",
      "BranchPlaneActionGroupName",
      "BranchPlaneMetricAlertName",
      "BranchPlaneActivityLogAlertName",
      "BranchPlaneAppInsightsName",
      "BranchPlaneLogAnalyticsWorkspaceName",
    ],
    requiredSourceMarkers: [
      "network.Zone",
      "network.RecordSet",
      "network.PrivateZone",
      "network.PrivateRecordSet",
      "network.PublicIPAddress",
      "network.LoadBalancer",
      "app.ManagedEnvironment",
      "app.ContainerApp",
      "servicebus.",
      "storage.FileShare",
      "cache.Redis",
      "eventgrid.",
      "keyvault.",
      "appconfiguration.",
      "insights.ActionGroup",
      "insights.MetricAlert",
      "insights.ActivityLogAlert",
      "operationalinsights.",
      "branch-dispatch",
      "branch-drop",
    ],
    forbiddenSourceMarkers: ["frontdoor", "apimanagement", "containerservice", "documentdb", "dbformysql", "dbforpostgresql", "datamigration", "private endpoint"],
    integrationChecks: [
      { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-branch-east-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-branch-west-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
      { label: "east-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-branch-east-91040/subnets/snet-branch-east-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "west-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-branch-west-91040/subnets/snet-branch-west-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
      { label: "public-dns-zone", provider: "Microsoft.Network", typePath: "dnsZones/branch91040.contoso.net", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones" },
      { label: "public-dns-east-record", provider: "Microsoft.Network", typePath: "dnsZones/branch91040.contoso.net/A/east", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/A" },
      { label: "public-dns-west-record", provider: "Microsoft.Network", typePath: "dnsZones/branch91040.contoso.net/A/west", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/A" },
      { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
      { label: "private-dns-link-east", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/virtualNetworkLinks/branch-link-east-91040", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "private-dns-link-west", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/virtualNetworkLinks/branch-link-west-91040", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
      { label: "private-gateway-record", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/A/gateway", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "private-workers-record", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/A/workers", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "private-files-record", provider: "Microsoft.Network", typePath: "privateDnsZones/branch.internal/A/files", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
      { label: "east-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-branch-east-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
      { label: "west-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-branch-west-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
      { label: "east-load-balancer", provider: "Microsoft.Network", typePath: "loadBalancers/lb-branch-east-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/loadBalancers" },
      { label: "west-load-balancer", provider: "Microsoft.Network", typePath: "loadBalancers/lb-branch-west-91040", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/loadBalancers" },
      { label: "east-managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-branch-east-91040", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "west-managed-environment", provider: "Microsoft.App", typePath: "managedEnvironments/cae-branch-west-91040", apiVersion: "2024-03-01", expectedType: "Microsoft.App/managedEnvironments" },
      { label: "east-gateway-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-gateway-east-91040", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "west-gateway-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-gateway-west-91040", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "east-worker-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-workers-east-91040", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "west-worker-app", provider: "Microsoft.App", typePath: "containerApps/ca-branch-workers-west-91040", apiVersion: "2024-03-01", expectedType: "Microsoft.App/containerApps" },
      { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-branch-plane-91040", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
      { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-branch-plane-91040/topics/branch-dispatch", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
      { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-branch-plane-91040/topics/branch-dispatch/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-branch-plane-91040/topics/branch-dispatch/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
      { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azbranchplane91040", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
      { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azbranchplane91040/fileServices/default/shares/branch-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
      { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-branch-plane-91040", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
      { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-branch-plane-91040", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
      { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-branch-plane-91040", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
      { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-branch-plane-91040", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
      { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-branch-plane-91040", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
      { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-branch-plane-91040", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
      { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-branch-plane-91040", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
      { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-branch-plane-91040", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
      { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-branch-plane-91040", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
    ],
  },
];

scenarios.push({
  poId: "caf2508c-d758-4c8a-8e50-e0c926e20be1",
  prId: "Pr91041",
  scenarioId: "multiregion-digital-command-mesh",
  title: "Multiregion digital command mesh",
  prompt: [
    "Our autonomous operations group wants one Azure deployment that can keep fleet command and telemetry alive across two regions without turning the control plane into a pile of disconnected services. They need regional device ingress, regional hot streams, one managed command API, one digital-thread layer, one transactional state store, durable command fan-out, downstream notification plumbing, and the usual secret, configuration, and observability services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
    "",
    "Use one IoT Hub in each region, one Event Hubs namespace in each region with one event hub in each namespace, one shared Function App as the command processor surface, one Azure Cosmos DB account with one SQL database and one container for command state, one Azure Digital Twins instance, one API Management service with one API and one product and one product API association and one `dispatch-command` operation with one operation policy, one Service Bus namespace with one topic and one `east-commands` subscription and one `west-commands` subscription, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, one Log Analytics workspace in each region, and one Application Insights component.",
    "",
    "Use these exact resource names: resource group `rg-az-digital-command-pulumi-91041`, east IoT Hub `iot-digital-east-91041`, west IoT Hub `iot-digital-west-91041`, east Event Hubs namespace `eh-digital-east-91041`, west Event Hubs namespace `eh-digital-west-91041`, east event hub `telemetry-east`, west event hub `telemetry-west`, Function App plan `plan-digital-command-91041`, Function App `func-digital-command-91041`, Cosmos DB account `cosmos-digital-command-91041`, Cosmos SQL database `CommandStateDb`, Cosmos SQL container `CommandState`, Azure Digital Twins instance `adt-digital-command-91041`, API Management service `apim-digital-command-91041`, API Management API `digital-command-api`, API Management product `digital-command-product`, API Management operation `dispatch-command`, Service Bus namespace `sb-digital-command-91041`, Service Bus topic `digital-commands`, Service Bus subscription `east-commands`, Service Bus subscription `west-commands`, Event Grid topic `eg-digital-command-91041`, Key Vault `kv-digital-command-91041`, App Configuration store `cfg-digital-command-91041`, action group `ag-digital-command-91041`, metric alert `ma-digital-command-91041`, activity log alert `ala-digital-command-91041`, east Log Analytics workspace `log-digital-east-91041`, west Log Analytics workspace `log-digital-west-91041`, and Application Insights component `appi-digital-command-91041`.",
    "",
    "Keep this limited to the digital command mesh. Do not add Front Door, Application Gateway, AKS, private endpoints, custom domains, MySQL, PostgreSQL, or Database Migration Service.",
    "",
    "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `DigitalCommandApiGatewayUrl`, `DigitalCommandEastIotHubName`, `DigitalCommandWestIotHubName`, `DigitalCommandEastEventHubNamespaceName`, `DigitalCommandWestEventHubNamespaceName`, `DigitalCommandEastEventHubName`, `DigitalCommandWestEventHubName`, `DigitalCommandFunctionHostName`, `DigitalCommandCosmosAccountName`, `DigitalCommandCosmosDatabaseName`, `DigitalCommandCosmosContainerName`, `DigitalCommandDigitalTwinsName`, `DigitalCommandTopicName`, `DigitalCommandEastCommandSubscriptionName`, `DigitalCommandWestCommandSubscriptionName`, `DigitalCommandKeyVaultName`, `DigitalCommandAppConfigName`, `DigitalCommandActionGroupName`, `DigitalCommandMetricAlertName`, `DigitalCommandActivityLogAlertName`, `DigitalCommandEastLogAnalyticsWorkspaceName`, `DigitalCommandWestLogAnalyticsWorkspaceName`, `DigitalCommandAppInsightsName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
  ].join("\n"),
  fieldReferences: [
    {
      title: "Introduction to Azure IoT",
      url: "https://learn.microsoft.com/en-us/azure/iot/iot-introduction",
      why: "Grounds the regional device-ingress and telemetry landing pattern.",
    },
    {
      title: "Integrate Event Hubs with serverless functions on Azure",
      url: "https://learn.microsoft.com/en-us/azure/architecture/serverless/event-hubs-functions/event-hubs-functions",
      why: "Grounds the hot-stream processing surface and runtime expectations for Event Hubs plus Functions.",
    },
    {
      title: "Create endpoints in Azure Digital Twins",
      url: "https://learn.microsoft.com/en-us/azure/digital-twins/how-to-create-endpoints",
      why: "Grounds the digital-thread layer and downstream event-routing model.",
    },
  ],
  resourceNames: {
    resourceGroup: "rg-az-digital-command-pulumi-91041",
    eastIotHub: "iot-digital-east-91041",
    westIotHub: "iot-digital-west-91041",
    eastEventHubNamespace: "eh-digital-east-91041",
    westEventHubNamespace: "eh-digital-west-91041",
    eastEventHub: "telemetry-east",
    westEventHub: "telemetry-west",
    functionAppPlan: "plan-digital-command-91041",
    functionApp: "func-digital-command-91041",
    cosmosAccount: "cosmos-digital-command-91041",
    cosmosDatabase: "CommandStateDb",
    cosmosContainer: "CommandState",
    digitalTwins: "adt-digital-command-91041",
    apiManagementService: "apim-digital-command-91041",
    apiManagementApi: "digital-command-api",
    apiManagementProduct: "digital-command-product",
    apiManagementOperation: "dispatch-command",
    serviceBusNamespace: "sb-digital-command-91041",
    serviceBusTopic: "digital-commands",
    eastCommandSubscription: "east-commands",
    westCommandSubscription: "west-commands",
    eventGridTopic: "eg-digital-command-91041",
    keyVault: "kv-digital-command-91041",
    appConfigStore: "cfg-digital-command-91041",
    actionGroup: "ag-digital-command-91041",
    metricAlert: "ma-digital-command-91041",
    activityLogAlert: "ala-digital-command-91041",
    eastLogAnalyticsWorkspace: "log-digital-east-91041",
    westLogAnalyticsWorkspace: "log-digital-west-91041",
    applicationInsights: "appi-digital-command-91041",
  },
  expectedOutputKeys: [
    "DigitalCommandApiGatewayUrl",
    "DigitalCommandEastIotHubName",
    "DigitalCommandWestIotHubName",
    "DigitalCommandEastEventHubNamespaceName",
    "DigitalCommandWestEventHubNamespaceName",
    "DigitalCommandEastEventHubName",
    "DigitalCommandWestEventHubName",
    "DigitalCommandFunctionHostName",
    "DigitalCommandCosmosAccountName",
    "DigitalCommandCosmosDatabaseName",
    "DigitalCommandCosmosContainerName",
    "DigitalCommandDigitalTwinsName",
    "DigitalCommandTopicName",
    "DigitalCommandEastCommandSubscriptionName",
    "DigitalCommandWestCommandSubscriptionName",
    "DigitalCommandKeyVaultName",
    "DigitalCommandAppConfigName",
    "DigitalCommandActionGroupName",
    "DigitalCommandMetricAlertName",
    "DigitalCommandActivityLogAlertName",
    "DigitalCommandEastLogAnalyticsWorkspaceName",
    "DigitalCommandWestLogAnalyticsWorkspaceName",
    "DigitalCommandAppInsightsName",
  ],
  requiredSourceMarkers: [
    "devices.",
    "eventhub.",
    "web.",
    "documentdb.",
    "digitaltwins",
    "apimanagement.",
    "servicebus.",
    "eventgrid.",
    "keyvault.",
    "appconfiguration.",
    "insights.ActionGroup",
    "insights.MetricAlert",
    "insights.ActivityLogAlert",
    "operationalinsights.",
    "dispatch-command",
    "digital-commands",
  ],
  forbiddenSourceMarkers: ["frontdoor", "containerservice", "network.ApplicationGateway", "dbformysql", "dbforpostgresql", "datamigration", "private endpoint"],
  integrationChecks: [
    { label: "east-iot-hub", provider: "Microsoft.Devices", typePath: "IotHubs/iot-digital-east-91041", apiVersion: "2023-06-30", expectedType: "Microsoft.Devices/IotHubs" },
    { label: "west-iot-hub", provider: "Microsoft.Devices", typePath: "IotHubs/iot-digital-west-91041", apiVersion: "2023-06-30", expectedType: "Microsoft.Devices/IotHubs" },
    { label: "east-event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-digital-east-91041", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
    { label: "west-event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-digital-west-91041", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
    { label: "east-event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-digital-east-91041/eventhubs/telemetry-east", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
    { label: "west-event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-digital-west-91041/eventhubs/telemetry-west", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
    { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-digital-command-91041", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
    { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-digital-command-91041", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
    { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-digital-command-91041", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
    { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-digital-command-91041/sqlDatabases/CommandStateDb", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
    { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-digital-command-91041/sqlDatabases/CommandStateDb/containers/CommandState", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
    { label: "digital-twins", provider: "Microsoft.DigitalTwins", typePath: "digitalTwinsInstances/adt-digital-command-91041", apiVersion: "2023-01-31", expectedType: "Microsoft.DigitalTwins/digitalTwinsInstances" },
    { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-digital-command-91041", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
    { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-digital-command-91041/apis/digital-command-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
    { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-digital-command-91041/products/digital-command-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
    { label: "api-management-product-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-digital-command-91041/products/digital-command-product/apis/digital-command-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products/apis" },
    { label: "api-management-operation", provider: "Microsoft.ApiManagement", typePath: "service/apim-digital-command-91041/apis/digital-command-api/operations/dispatch-command", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations" },
    { label: "api-management-operation-policy", provider: "Microsoft.ApiManagement", typePath: "service/apim-digital-command-91041/apis/digital-command-api/operations/dispatch-command/policies/policy", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations/policies" },
    { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-digital-command-91041", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
    { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-digital-command-91041/topics/digital-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
    { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-digital-command-91041/topics/digital-commands/subscriptions/east-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-digital-command-91041/topics/digital-commands/subscriptions/west-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-digital-command-91041", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
    { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-digital-command-91041", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
    { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-digital-command-91041", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
    { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-digital-command-91041", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
    { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-digital-command-91041", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
    { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-digital-command-91041", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
    { label: "east-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-digital-east-91041", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "west-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-digital-west-91041", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-digital-command-91041", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
  ],
});

scenarios.push({
  poId: "b170f471-d3fb-4b79-b284-2daff6fe7ca5",
  prId: "Pr91043",
  scenarioId: "dual-region-cutover-edge-plane",
  title: "Dual-region cutover edge plane",
  prompt: [
    "Our release modernization office wants one Azure deployment that can run a supervised database cutover program across two regions without forcing operators to stitch together separate stacks for edge ingress, approval workflows, migration services, and rollback signaling. They need a global edge, two regional ingress origins, one managed API surface for approvals, one function-backed control hook, one workflow layer, dual database engines, migration projects, durable cutover fan-out, public DNS for the control endpoint, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
    "",
    "Use one Azure Front Door profile with one endpoint, one origin group, one east origin, one west origin, one route, one security policy, and one WAF policy, one Azure public DNS zone with one CNAME record for the control endpoint, one virtual network in each region with one application gateway subnet and one workload subnet, one public IP address and one Application Gateway in each region, one API Management service with one API and one product and one product API association and one `approve-cutover` operation with one operation policy, one Function App plan and one Function App, one Logic App workflow, one Database Migration Service with one MySQL project and one PostgreSQL project, one MySQL flexible server with one database, one PostgreSQL flexible server with one database, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription and one `rollback` subscription, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, one Log Analytics workspace in each region, and one Application Insights component.",
    "",
    "Use these exact resource names: resource group `rg-az-cutover-edge-pulumi-91043`, Front Door profile `afd-cutover-edge-91043`, Front Door endpoint `cutover-edge-endpoint`, Front Door origin group `cutover-edge-origins`, Front Door east origin `east-cutover-origin`, Front Door west origin `west-cutover-origin`, Front Door route `cutover-edge-route`, Front Door security policy `cutover-edge-security-policy`, WAF policy `waf-cutover-edge-91043`, public DNS zone `cutover91043.contoso.net`, public DNS CNAME record `api.cutover91043.contoso.net`, east virtual network `vnet-cutover-east-91043`, west virtual network `vnet-cutover-west-91043`, east application gateway subnet `snet-cutover-agw-east-91043`, west application gateway subnet `snet-cutover-agw-west-91043`, east workload subnet `snet-cutover-work-east-91043`, west workload subnet `snet-cutover-work-west-91043`, east public IP `pip-cutover-east-91043`, west public IP `pip-cutover-west-91043`, east Application Gateway `agw-cutover-east-91043`, west Application Gateway `agw-cutover-west-91043`, API Management service `apim-cutover-edge-91043`, API Management API `cutover-edge-api`, API Management product `cutover-edge-product`, API Management operation `approve-cutover`, Function App plan `plan-cutover-edge-91043`, Function App `func-cutover-edge-91043`, Logic App workflow `la-cutover-edge-91043`, Database Migration Service `dms-cutover-edge-91043`, MySQL flexible server `mysql-cutover-edge-91043`, MySQL database `billingdb`, PostgreSQL flexible server `pg-cutover-edge-91043`, PostgreSQL database `ledgerdb`, Database Migration Service project `mysql-cutover-project`, Database Migration Service project `postgres-cutover-project`, Service Bus namespace `sb-cutover-edge-91043`, Service Bus topic `cutover-approvals`, Service Bus subscription `east`, Service Bus subscription `west`, Service Bus subscription `rollback`, Event Grid topic `eg-cutover-edge-91043`, Key Vault `kv-cutover-edge-91043`, App Configuration store `cfg-cutover-edge-91043`, action group `ag-cutover-edge-91043`, metric alert `ma-cutover-edge-91043`, activity log alert `ala-cutover-edge-91043`, east Log Analytics workspace `log-cutover-east-91043`, west Log Analytics workspace `log-cutover-west-91043`, and Application Insights component `appi-cutover-edge-91043`.",
    "",
    "Keep this limited to the cutover edge plane. Do not add AKS, Container Apps, Cosmos DB, Synapse, Azure Files, or private endpoints.",
    "",
    "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `CutoverEdgeFrontDoorEndpointHostName`, `CutoverEdgeRouteName`, `CutoverEdgePublicDnsZoneName`, `CutoverEdgePublicDnsRecordName`, `CutoverEdgeEastApplicationGatewayName`, `CutoverEdgeWestApplicationGatewayName`, `CutoverEdgeApiGatewayUrl`, `CutoverEdgeFunctionHostName`, `CutoverEdgeWorkflowName`, `CutoverEdgeDmsServiceName`, `CutoverEdgeMySqlServerName`, `CutoverEdgeMySqlDatabaseName`, `CutoverEdgePostgresServerName`, `CutoverEdgePostgresDatabaseName`, `CutoverEdgeMySqlProjectName`, `CutoverEdgePostgresProjectName`, `CutoverEdgeTopicName`, `CutoverEdgeEastSubscriptionName`, `CutoverEdgeWestSubscriptionName`, `CutoverEdgeRollbackSubscriptionName`, `CutoverEdgeEventGridTopicEndpoint`, `CutoverEdgeKeyVaultName`, `CutoverEdgeAppConfigName`, `CutoverEdgeActionGroupName`, `CutoverEdgeMetricAlertName`, `CutoverEdgeActivityLogAlertName`, `CutoverEdgeEastLogAnalyticsWorkspaceName`, `CutoverEdgeWestLogAnalyticsWorkspaceName`, `CutoverEdgeAppInsightsName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
  ].join("\n"),
  fieldReferences: [
    {
      title: "Configure Azure Front Door in front of Azure API Management",
      url: "https://learn.microsoft.com/en-us/azure/api-management/front-door-api-management",
      why: "Grounds the managed API surface behind a global edge.",
    },
    {
      title: "What is Azure Database Migration Service?",
      url: "https://learn.microsoft.com/en-us/azure/dms/dms-overview",
      why: "Grounds the cutover and migration project layer for the dual-engine workflow.",
    },
    {
      title: "Basic enterprise integration on Azure",
      url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/enterprise-integration/basic-enterprise-integration",
      why: "Grounds the API, workflow, and messaging coordination pattern around the cutover plane.",
    },
  ],
  resourceNames: {
    resourceGroup: "rg-az-cutover-edge-pulumi-91043",
    frontDoorProfile: "afd-cutover-edge-91043",
    frontDoorEndpoint: "cutover-edge-endpoint",
    frontDoorOriginGroup: "cutover-edge-origins",
    frontDoorEastOrigin: "east-cutover-origin",
    frontDoorWestOrigin: "west-cutover-origin",
    frontDoorRoute: "cutover-edge-route",
    securityPolicy: "cutover-edge-security-policy",
    wafPolicy: "waf-cutover-edge-91043",
    publicDnsZone: "cutover91043.contoso.net",
    publicDnsRecord: "api",
    eastVirtualNetwork: "vnet-cutover-east-91043",
    westVirtualNetwork: "vnet-cutover-west-91043",
    eastApplicationGatewaySubnet: "snet-cutover-agw-east-91043",
    westApplicationGatewaySubnet: "snet-cutover-agw-west-91043",
    eastWorkloadSubnet: "snet-cutover-work-east-91043",
    westWorkloadSubnet: "snet-cutover-work-west-91043",
    eastPublicIp: "pip-cutover-east-91043",
    westPublicIp: "pip-cutover-west-91043",
    eastApplicationGateway: "agw-cutover-east-91043",
    westApplicationGateway: "agw-cutover-west-91043",
    apiManagementService: "apim-cutover-edge-91043",
    apiManagementApi: "cutover-edge-api",
    apiManagementProduct: "cutover-edge-product",
    apiManagementOperation: "approve-cutover",
    functionAppPlan: "plan-cutover-edge-91043",
    functionApp: "func-cutover-edge-91043",
    logicWorkflow: "la-cutover-edge-91043",
    dmsService: "dms-cutover-edge-91043",
    mySqlServer: "mysql-cutover-edge-91043",
    mySqlDatabase: "billingdb",
    postgresServer: "pg-cutover-edge-91043",
    postgresDatabase: "ledgerdb",
    mySqlProject: "mysql-cutover-project",
    postgresProject: "postgres-cutover-project",
    serviceBusNamespace: "sb-cutover-edge-91043",
    serviceBusTopic: "cutover-approvals",
    eastSubscription: "east",
    westSubscription: "west",
    rollbackSubscription: "rollback",
    eventGridTopic: "eg-cutover-edge-91043",
    keyVault: "kv-cutover-edge-91043",
    appConfigStore: "cfg-cutover-edge-91043",
    actionGroup: "ag-cutover-edge-91043",
    metricAlert: "ma-cutover-edge-91043",
    activityLogAlert: "ala-cutover-edge-91043",
    eastLogAnalyticsWorkspace: "log-cutover-east-91043",
    westLogAnalyticsWorkspace: "log-cutover-west-91043",
    applicationInsights: "appi-cutover-edge-91043",
  },
  expectedOutputKeys: [
    "CutoverEdgeFrontDoorEndpointHostName",
    "CutoverEdgeRouteName",
    "CutoverEdgePublicDnsZoneName",
    "CutoverEdgePublicDnsRecordName",
    "CutoverEdgeEastApplicationGatewayName",
    "CutoverEdgeWestApplicationGatewayName",
    "CutoverEdgeApiGatewayUrl",
    "CutoverEdgeFunctionHostName",
    "CutoverEdgeWorkflowName",
    "CutoverEdgeDmsServiceName",
    "CutoverEdgeMySqlServerName",
    "CutoverEdgeMySqlDatabaseName",
    "CutoverEdgePostgresServerName",
    "CutoverEdgePostgresDatabaseName",
    "CutoverEdgeMySqlProjectName",
    "CutoverEdgePostgresProjectName",
    "CutoverEdgeTopicName",
    "CutoverEdgeEastSubscriptionName",
    "CutoverEdgeWestSubscriptionName",
    "CutoverEdgeRollbackSubscriptionName",
    "CutoverEdgeEventGridTopicEndpoint",
    "CutoverEdgeKeyVaultName",
    "CutoverEdgeAppConfigName",
    "CutoverEdgeActionGroupName",
    "CutoverEdgeMetricAlertName",
    "CutoverEdgeActivityLogAlertName",
    "CutoverEdgeEastLogAnalyticsWorkspaceName",
    "CutoverEdgeWestLogAnalyticsWorkspaceName",
    "CutoverEdgeAppInsightsName",
  ],
  requiredSourceMarkers: [
    "cdn.",
    "network.WebApplicationFirewallPolicy",
    "network.Zone",
    "network.RecordSet",
    "network.PublicIPAddress",
    "network.VirtualNetwork",
    "network.ApplicationGateway",
    "apimanagement.",
    "web.",
    "logic.",
    "datamigration.",
    "dbformysql.",
    "dbforpostgresql.",
    "servicebus.",
    "eventgrid.",
    "keyvault.",
    "appconfiguration.",
    "insights.ActionGroup",
    "insights.MetricAlert",
    "insights.ActivityLogAlert",
    "operationalinsights.",
    "approve-cutover",
    "cutover-approvals",
  ],
  forbiddenSourceMarkers: ["containerservice", "app.ManagedEnvironment", "documentdb", "synapse.", "storage.FileShare", "private endpoint"],
  integrationChecks: [
    { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles" },
    { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043/afdEndpoints/cutover-edge-endpoint", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
    { label: "front-door-origin-group", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043/originGroups/cutover-edge-origins", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/originGroups" },
    { label: "front-door-origin-east", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043/originGroups/cutover-edge-origins/origins/east-cutover-origin", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/originGroups/origins" },
    { label: "front-door-origin-west", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043/originGroups/cutover-edge-origins/origins/west-cutover-origin", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/originGroups/origins" },
    { label: "front-door-route", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043/afdEndpoints/cutover-edge-endpoint/routes/cutover-edge-route", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints/routes" },
    { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-cutover-edge-91043/securityPolicies/cutover-edge-security-policy", apiVersion: "2024-02-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
    { label: "waf-policy", provider: "Microsoft.Network", typePath: "ApplicationGatewayWebApplicationFirewallPolicies/waf-cutover-edge-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies" },
    { label: "public-dns-zone", provider: "Microsoft.Network", typePath: "dnsZones/cutover91043.contoso.net", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones" },
    { label: "public-dns-record", provider: "Microsoft.Network", typePath: "dnsZones/cutover91043.contoso.net/CNAME/api", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/CNAME" },
    { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-cutover-east-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
    { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-cutover-west-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
    { label: "east-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-cutover-east-91043/subnets/snet-cutover-agw-east-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "west-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-cutover-west-91043/subnets/snet-cutover-agw-west-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "east-work-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-cutover-east-91043/subnets/snet-cutover-work-east-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "west-work-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-cutover-west-91043/subnets/snet-cutover-work-west-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "east-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-cutover-east-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
    { label: "west-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-cutover-west-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
    { label: "east-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-cutover-east-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
    { label: "west-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-cutover-west-91043", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
    { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-edge-91043", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
    { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-edge-91043/apis/cutover-edge-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
    { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-edge-91043/products/cutover-edge-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
    { label: "api-management-product-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-edge-91043/products/cutover-edge-product/apis/cutover-edge-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products/apis" },
    { label: "api-management-operation", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-edge-91043/apis/cutover-edge-api/operations/approve-cutover", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations" },
    { label: "api-management-operation-policy", provider: "Microsoft.ApiManagement", typePath: "service/apim-cutover-edge-91043/apis/cutover-edge-api/operations/approve-cutover/policies/policy", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations/policies" },
    { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-cutover-edge-91043", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
    { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-cutover-edge-91043", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
    { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-cutover-edge-91043", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
    { label: "dms-service", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-edge-91043", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services" },
    { label: "mysql-server", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-cutover-edge-91043", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers" },
    { label: "mysql-database", provider: "Microsoft.DBforMySQL", typePath: "flexibleServers/mysql-cutover-edge-91043/databases/billingdb", apiVersion: "2023-12-30", expectedType: "Microsoft.DBforMySQL/flexibleServers/databases" },
    { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-cutover-edge-91043", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
    { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-cutover-edge-91043/databases/ledgerdb", apiVersion: "2023-06-01-preview", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
    { label: "dms-project-mysql", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-edge-91043/projects/mysql-cutover-project", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
    { label: "dms-project-postgres", provider: "Microsoft.DataMigration", typePath: "services/dms-cutover-edge-91043/projects/postgres-cutover-project", apiVersion: "2022-03-30-preview", expectedType: "Microsoft.DataMigration/services/projects" },
    { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-edge-91043", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
    { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-edge-91043/topics/cutover-approvals", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
    { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-edge-91043/topics/cutover-approvals/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-edge-91043/topics/cutover-approvals/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-rollback", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-cutover-edge-91043/topics/cutover-approvals/subscriptions/rollback", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-cutover-edge-91043", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
    { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-cutover-edge-91043", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
    { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-cutover-edge-91043", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
    { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-cutover-edge-91043", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
    { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-cutover-edge-91043", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
    { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-cutover-edge-91043", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
    { label: "east-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-cutover-east-91043", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "west-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-cutover-west-91043", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-cutover-edge-91043", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
  ],
});

scenarios.push({
  poId: "cb430cc9-db41-44d3-8b32-460d233c7b72",
  prId: "Pr91044",
  scenarioId: "private-robotics-aks-discovery-plane",
  title: "Private robotics AKS discovery plane",
  prompt: [
    "Our robotics platform team wants one Azure deployment that can keep private service discovery, regional ingress, and workload orchestration coherent across two regions. They need public and private DNS, regional ingress gateways, two AKS clusters, one registry and identity plane, a durable job channel, shared file evidence, fast session state, downstream event signaling, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript using `eastus` and `westus2`.",
    "",
    "Use one Azure public DNS zone with one A record for `east` and one A record for `west`, one Azure Private DNS zone linked to both regional virtual networks with one private A record for `gateway` and one for `workers` and one for `files`, one user-assigned managed identity, one Azure Container Registry, one virtual network in each region with one application gateway subnet and one workload subnet, one public IP address and one Application Gateway in each region, one AKS cluster in each region, one Service Bus namespace with one topic and one `east` subscription and one `west` subscription, one storage account with one Azure Files share, one Redis cache, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, one Log Analytics workspace in each region, and one Application Insights component.",
    "",
    "Use these exact resource names: resource group `rg-az-robotics-discovery-pulumi-91044`, public DNS zone `robotics91044.contoso.net`, public DNS A record `east.robotics91044.contoso.net`, public DNS A record `west.robotics91044.contoso.net`, private DNS zone `robotics.internal`, private DNS virtual network link `robotics-link-east-91044`, private DNS virtual network link `robotics-link-west-91044`, private DNS A record `gateway.robotics.internal`, private DNS A record `workers.robotics.internal`, private DNS A record `files.robotics.internal`, managed identity `id-robotics-91044`, Container Registry `acrrobotics91044`, east virtual network `vnet-robotics-east-91044`, west virtual network `vnet-robotics-west-91044`, east application gateway subnet `snet-robotics-agw-east-91044`, west application gateway subnet `snet-robotics-agw-west-91044`, east workload subnet `snet-robotics-work-east-91044`, west workload subnet `snet-robotics-work-west-91044`, east public IP `pip-robotics-east-91044`, west public IP `pip-robotics-west-91044`, east Application Gateway `agw-robotics-east-91044`, west Application Gateway `agw-robotics-west-91044`, east AKS cluster `aks-robotics-east-91044`, west AKS cluster `aks-robotics-west-91044`, Service Bus namespace `sb-robotics-91044`, Service Bus topic `robotics-jobs`, Service Bus subscription `east`, Service Bus subscription `west`, storage account `azrobotics91044`, Azure Files share `robotics-drop`, Redis cache `redis-robotics-91044`, Event Grid topic `eg-robotics-91044`, Key Vault `kv-robotics-91044`, App Configuration store `cfg-robotics-91044`, action group `ag-robotics-91044`, metric alert `ma-robotics-91044`, activity log alert `ala-robotics-91044`, east Log Analytics workspace `log-robotics-east-91044`, west Log Analytics workspace `log-robotics-west-91044`, and Application Insights component `appi-robotics-91044`.",
    "",
    "Keep this limited to the robotics discovery plane. Do not add Front Door, API Management, Functions, Logic Apps, Cosmos DB, Synapse, MySQL, PostgreSQL, Database Migration Service, or private endpoints.",
    "",
    "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `RoboticsPublicDnsZoneName`, `RoboticsPrivateDnsZoneName`, `RoboticsRegistryName`, `RoboticsManagedIdentityName`, `RoboticsEastApplicationGatewayName`, `RoboticsWestApplicationGatewayName`, `RoboticsEastClusterName`, `RoboticsWestClusterName`, `RoboticsTopicName`, `RoboticsEastSubscriptionName`, `RoboticsWestSubscriptionName`, `RoboticsFileShareName`, `RoboticsRedisName`, `RoboticsEventGridTopicEndpoint`, `RoboticsKeyVaultName`, `RoboticsAppConfigName`, `RoboticsActionGroupName`, `RoboticsMetricAlertName`, `RoboticsActivityLogAlertName`, `RoboticsEastLogAnalyticsWorkspaceName`, `RoboticsWestLogAnalyticsWorkspaceName`, `RoboticsAppInsightsName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
  ].join("\n"),
  fieldReferences: [
    {
      title: "AKS baseline for multiregion clusters",
      url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks-multi-region/aks-multi-cluster",
      why: "Grounds the regional cluster and shared control-surface topology.",
    },
    {
      title: "Private DNS zones",
      url: "https://learn.microsoft.com/en-us/azure/dns/private-dns-overview",
      why: "Grounds the internal service-discovery layer across linked virtual networks.",
    },
    {
      title: "Multi-region load balancing with Traffic Manager and Application Gateway",
      url: "https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/n-tier/multi-region-sql-server",
      why: "Grounds the dual-region ingress shape with public IPs and application gateways.",
    },
  ],
  resourceNames: {
    resourceGroup: "rg-az-robotics-discovery-pulumi-91044",
    publicDnsZone: "robotics91044.contoso.net",
    publicDnsEastRecord: "east",
    publicDnsWestRecord: "west",
    privateDnsZone: "robotics.internal",
    privateDnsLinkEast: "robotics-link-east-91044",
    privateDnsLinkWest: "robotics-link-west-91044",
    managedIdentity: "id-robotics-91044",
    registry: "acrrobotics91044",
    eastVirtualNetwork: "vnet-robotics-east-91044",
    westVirtualNetwork: "vnet-robotics-west-91044",
    eastApplicationGatewaySubnet: "snet-robotics-agw-east-91044",
    westApplicationGatewaySubnet: "snet-robotics-agw-west-91044",
    eastWorkloadSubnet: "snet-robotics-work-east-91044",
    westWorkloadSubnet: "snet-robotics-work-west-91044",
    eastPublicIp: "pip-robotics-east-91044",
    westPublicIp: "pip-robotics-west-91044",
    eastApplicationGateway: "agw-robotics-east-91044",
    westApplicationGateway: "agw-robotics-west-91044",
    eastCluster: "aks-robotics-east-91044",
    westCluster: "aks-robotics-west-91044",
    serviceBusNamespace: "sb-robotics-91044",
    serviceBusTopic: "robotics-jobs",
    eastSubscription: "east",
    westSubscription: "west",
    storageAccount: "azrobotics91044",
    fileShare: "robotics-drop",
    redisCache: "redis-robotics-91044",
    eventGridTopic: "eg-robotics-91044",
    keyVault: "kv-robotics-91044",
    appConfigStore: "cfg-robotics-91044",
    actionGroup: "ag-robotics-91044",
    metricAlert: "ma-robotics-91044",
    activityLogAlert: "ala-robotics-91044",
    eastLogAnalyticsWorkspace: "log-robotics-east-91044",
    westLogAnalyticsWorkspace: "log-robotics-west-91044",
    applicationInsights: "appi-robotics-91044",
  },
  expectedOutputKeys: [
    "RoboticsPublicDnsZoneName",
    "RoboticsPrivateDnsZoneName",
    "RoboticsRegistryName",
    "RoboticsManagedIdentityName",
    "RoboticsEastApplicationGatewayName",
    "RoboticsWestApplicationGatewayName",
    "RoboticsEastClusterName",
    "RoboticsWestClusterName",
    "RoboticsTopicName",
    "RoboticsEastSubscriptionName",
    "RoboticsWestSubscriptionName",
    "RoboticsFileShareName",
    "RoboticsRedisName",
    "RoboticsEventGridTopicEndpoint",
    "RoboticsKeyVaultName",
    "RoboticsAppConfigName",
    "RoboticsActionGroupName",
    "RoboticsMetricAlertName",
    "RoboticsActivityLogAlertName",
    "RoboticsEastLogAnalyticsWorkspaceName",
    "RoboticsWestLogAnalyticsWorkspaceName",
    "RoboticsAppInsightsName",
  ],
  requiredSourceMarkers: [
    "network.Zone",
    "network.RecordSet",
    "network.PrivateZone",
    "network.PrivateRecordSet",
    "managedidentity.",
    "containerregistry.",
    "network.VirtualNetwork",
    "network.PublicIPAddress",
    "network.ApplicationGateway",
    "containerservice.",
    "servicebus.",
    "storage.FileShare",
    "cache.Redis",
    "eventgrid.",
    "keyvault.",
    "appconfiguration.",
    "insights.ActionGroup",
    "insights.MetricAlert",
    "insights.ActivityLogAlert",
    "operationalinsights.",
    "robotics-jobs",
  ],
  forbiddenSourceMarkers: ["frontdoor", "apimanagement", "web.", "logic.", "documentdb", "synapse.", "dbformysql", "dbforpostgresql", "datamigration", "private endpoint"],
  integrationChecks: [
    { label: "public-dns-zone", provider: "Microsoft.Network", typePath: "dnsZones/robotics91044.contoso.net", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones" },
    { label: "public-dns-east-record", provider: "Microsoft.Network", typePath: "dnsZones/robotics91044.contoso.net/A/east", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/A" },
    { label: "public-dns-west-record", provider: "Microsoft.Network", typePath: "dnsZones/robotics91044.contoso.net/A/west", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/A" },
    { label: "private-dns-zone", provider: "Microsoft.Network", typePath: "privateDnsZones/robotics.internal", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones" },
    { label: "private-dns-link-east", provider: "Microsoft.Network", typePath: "privateDnsZones/robotics.internal/virtualNetworkLinks/robotics-link-east-91044", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
    { label: "private-dns-link-west", provider: "Microsoft.Network", typePath: "privateDnsZones/robotics.internal/virtualNetworkLinks/robotics-link-west-91044", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/virtualNetworkLinks" },
    { label: "private-gateway-record", provider: "Microsoft.Network", typePath: "privateDnsZones/robotics.internal/A/gateway", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
    { label: "private-workers-record", provider: "Microsoft.Network", typePath: "privateDnsZones/robotics.internal/A/workers", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
    { label: "private-files-record", provider: "Microsoft.Network", typePath: "privateDnsZones/robotics.internal/A/files", apiVersion: "2020-06-01", expectedType: "Microsoft.Network/privateDnsZones/A" },
    { label: "managed-identity", provider: "Microsoft.ManagedIdentity", typePath: "userAssignedIdentities/id-robotics-91044", apiVersion: "2023-01-31", expectedType: "Microsoft.ManagedIdentity/userAssignedIdentities" },
    { label: "container-registry", provider: "Microsoft.ContainerRegistry", typePath: "registries/acrrobotics91044", apiVersion: "2023-07-01", expectedType: "Microsoft.ContainerRegistry/registries" },
    { label: "east-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-robotics-east-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
    { label: "west-vnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-robotics-west-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks" },
    { label: "east-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-robotics-east-91044/subnets/snet-robotics-agw-east-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "west-appgw-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-robotics-west-91044/subnets/snet-robotics-agw-west-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "east-work-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-robotics-east-91044/subnets/snet-robotics-work-east-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "west-work-subnet", provider: "Microsoft.Network", typePath: "virtualNetworks/vnet-robotics-west-91044/subnets/snet-robotics-work-west-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/virtualNetworks/subnets" },
    { label: "east-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-robotics-east-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
    { label: "west-public-ip", provider: "Microsoft.Network", typePath: "publicIPAddresses/pip-robotics-west-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/publicIPAddresses" },
    { label: "east-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-robotics-east-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
    { label: "west-application-gateway", provider: "Microsoft.Network", typePath: "applicationGateways/agw-robotics-west-91044", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/applicationGateways" },
    { label: "east-aks", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-robotics-east-91044", apiVersion: "2024-01-01", expectedType: "Microsoft.ContainerService/managedClusters" },
    { label: "west-aks", provider: "Microsoft.ContainerService", typePath: "managedClusters/aks-robotics-west-91044", apiVersion: "2024-01-01", expectedType: "Microsoft.ContainerService/managedClusters" },
    { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-robotics-91044", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
    { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-robotics-91044/topics/robotics-jobs", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
    { label: "service-bus-subscription-east", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-robotics-91044/topics/robotics-jobs/subscriptions/east", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-west", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-robotics-91044/topics/robotics-jobs/subscriptions/west", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azrobotics91044", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
    { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azrobotics91044/fileServices/default/shares/robotics-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
    { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-robotics-91044", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
    { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-robotics-91044", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
    { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-robotics-91044", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
    { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-robotics-91044", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
    { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-robotics-91044", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
    { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-robotics-91044", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
    { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-robotics-91044", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
    { label: "east-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-robotics-east-91044", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "west-log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-robotics-west-91044", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-robotics-91044", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
  ],
});

scenarios.push({
  poId: "2680382d-cd3c-4553-951c-20f102ebe606",
  prId: "Pr91042",
  scenarioId: "regulated-replay-warehouse-fabric",
  title: "Regulated replay warehouse fabric",
  prompt: [
    "Our regulated operations analytics team wants one Azure deployment that can ingest replay traffic, keep near-real-time operational state, expose a governed replay command surface, and retain a warehouse-grade query plane without splitting the environment into disconnected stacks. They need hot ingest, replay orchestration, a state store, an analytical warehouse, durable command channels, staging storage, and the normal secret, configuration, and telemetry services. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
    "",
    "Use one Event Hubs namespace with one event hub, one Function App, one Azure Cosmos DB account with one SQL database and one container, one Azure Synapse workspace with one SQL pool, one API Management service with one API and one product and one product API association and one `replay-batch` operation with one operation policy, one Service Bus namespace with one topic and one `ingest` subscription and one `reconcile` subscription, one Blob Storage account with one blob container and one Azure Files share, one Event Grid topic, one Key Vault, one App Configuration store, one Azure Monitor action group, one Azure Monitor metric alert, one Azure Monitor activity log alert, one Log Analytics workspace, and one Application Insights component.",
    "",
    "Use these exact resource names: resource group `rg-az-replay-warehouse-pulumi-91042`, Event Hubs namespace `eh-replay-warehouse-91042`, Event Hub `replay-ingest`, Function App plan `plan-replay-warehouse-91042`, Function App `func-replay-warehouse-91042`, Cosmos DB account `cosmos-replay-warehouse-91042`, Cosmos SQL database `ReplayStateDb`, Cosmos SQL container `ReplayState`, Synapse workspace `syn-replay-warehouse-91042`, Synapse SQL pool `replaypool`, API Management service `apim-replay-warehouse-91042`, API Management API `replay-warehouse-api`, API Management product `replay-warehouse-product`, API Management operation `replay-batch`, Service Bus namespace `sb-replay-warehouse-91042`, Service Bus topic `replay-commands`, Service Bus subscription `ingest`, Service Bus subscription `reconcile`, storage account `azreplaywh91042`, blob container `replay-drop`, Azure Files share `replay-stage`, Event Grid topic `eg-replay-warehouse-91042`, Key Vault `kv-rply-wh-91042`, App Configuration store `cfg-replay-warehouse-91042`, action group `ag-replay-warehouse-91042`, metric alert `ma-replay-warehouse-91042`, activity log alert `ala-replay-warehouse-91042`, Log Analytics workspace `log-replay-warehouse-91042`, and Application Insights component `appi-replay-warehouse-91042`.",
    "",
    "Keep this focused on the replay warehouse fabric. Do not add Front Door, AKS, Application Gateway, private endpoints, custom domains, MySQL, PostgreSQL, or Database Migration Service.",
    "",
    "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ReplayWarehouseApiGatewayUrl`, `ReplayWarehouseEventHubNamespaceName`, `ReplayWarehouseEventHubName`, `ReplayWarehouseFunctionHostName`, `ReplayWarehouseCosmosAccountName`, `ReplayWarehouseCosmosDatabaseName`, `ReplayWarehouseCosmosContainerName`, `ReplayWarehouseSynapseWorkspaceName`, `ReplayWarehouseSynapseSqlPoolName`, `ReplayWarehouseTopicName`, `ReplayWarehouseIngestSubscriptionName`, `ReplayWarehouseReconcileSubscriptionName`, `ReplayWarehouseStorageAccountName`, `ReplayWarehouseBlobContainerName`, `ReplayWarehouseFileShareName`, `ReplayWarehouseEventGridTopicEndpoint`, `ReplayWarehouseKeyVaultName`, `ReplayWarehouseAppConfigName`, `ReplayWarehouseActionGroupName`, `ReplayWarehouseMetricAlertName`, `ReplayWarehouseActivityLogAlertName`, `ReplayWarehouseLogAnalyticsWorkspaceName`, `ReplayWarehouseAppInsightsName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
  ].join("\n"),
  fieldReferences: [
    {
      title: "Integrate Event Hubs with serverless functions on Azure",
      url: "https://learn.microsoft.com/en-us/azure/architecture/serverless/event-hubs-functions/event-hubs-functions",
      why: "Grounds the hot-ingest and replay processing surface.",
    },
    {
      title: "What is Azure Cosmos DB analytical store?",
      url: "https://learn.microsoft.com/en-us/azure/cosmos-db/analytical-store-introduction",
      why: "Grounds the separation between operational state and analytical query workloads around Cosmos-backed replay state.",
    },
    {
      title: "Azure Synapse Analytics",
      url: "https://learn.microsoft.com/en-us/azure/synapse-analytics/overview-what-is",
      why: "Grounds the warehouse and SQL pool layer for replay analysis.",
    },
  ],
  resourceNames: {
    resourceGroup: "rg-az-replay-warehouse-pulumi-91042",
    eventHubNamespace: "eh-replay-warehouse-91042",
    eventHub: "replay-ingest",
    functionAppPlan: "plan-replay-warehouse-91042",
    functionApp: "func-replay-warehouse-91042",
    cosmosAccount: "cosmos-replay-warehouse-91042",
    cosmosDatabase: "ReplayStateDb",
    cosmosContainer: "ReplayState",
    synapseWorkspace: "syn-replay-warehouse-91042",
    synapseSqlPool: "replaypool",
    apiManagementService: "apim-replay-warehouse-91042",
    apiManagementApi: "replay-warehouse-api",
    apiManagementProduct: "replay-warehouse-product",
    apiManagementOperation: "replay-batch",
    serviceBusNamespace: "sb-replay-warehouse-91042",
    serviceBusTopic: "replay-commands",
    ingestSubscription: "ingest",
    reconcileSubscription: "reconcile",
    storageAccount: "azreplaywh91042",
    blobContainer: "replay-drop",
    fileShare: "replay-stage",
    eventGridTopic: "eg-replay-warehouse-91042",
    keyVault: "kv-rply-wh-91042",
    appConfigStore: "cfg-replay-warehouse-91042",
    actionGroup: "ag-replay-warehouse-91042",
    metricAlert: "ma-replay-warehouse-91042",
    activityLogAlert: "ala-replay-warehouse-91042",
    logAnalyticsWorkspace: "log-replay-warehouse-91042",
    applicationInsights: "appi-replay-warehouse-91042",
  },
  expectedOutputKeys: [
    "ReplayWarehouseApiGatewayUrl",
    "ReplayWarehouseEventHubNamespaceName",
    "ReplayWarehouseEventHubName",
    "ReplayWarehouseFunctionHostName",
    "ReplayWarehouseCosmosAccountName",
    "ReplayWarehouseCosmosDatabaseName",
    "ReplayWarehouseCosmosContainerName",
    "ReplayWarehouseSynapseWorkspaceName",
    "ReplayWarehouseSynapseSqlPoolName",
    "ReplayWarehouseTopicName",
    "ReplayWarehouseIngestSubscriptionName",
    "ReplayWarehouseReconcileSubscriptionName",
    "ReplayWarehouseStorageAccountName",
    "ReplayWarehouseBlobContainerName",
    "ReplayWarehouseFileShareName",
    "ReplayWarehouseEventGridTopicEndpoint",
    "ReplayWarehouseKeyVaultName",
    "ReplayWarehouseAppConfigName",
    "ReplayWarehouseActionGroupName",
    "ReplayWarehouseMetricAlertName",
    "ReplayWarehouseActivityLogAlertName",
    "ReplayWarehouseLogAnalyticsWorkspaceName",
    "ReplayWarehouseAppInsightsName",
  ],
  requiredSourceMarkers: [
    "eventhub.",
    "web.",
    "documentdb.",
    "synapse.",
    "apimanagement.",
    "servicebus.",
    "storage.",
    "eventgrid.",
    "keyvault.",
    "appconfiguration.",
    "insights.ActionGroup",
    "insights.MetricAlert",
    "insights.ActivityLogAlert",
    "operationalinsights.",
    "replay-batch",
    "replay-commands",
  ],
  forbiddenSourceMarkers: ["frontdoor", "containerservice", "network.ApplicationGateway", "dbformysql", "dbforpostgresql", "datamigration", "private endpoint"],
  integrationChecks: [
    { label: "event-hub-namespace", provider: "Microsoft.EventHub", typePath: "namespaces/eh-replay-warehouse-91042", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces" },
    { label: "event-hub", provider: "Microsoft.EventHub", typePath: "namespaces/eh-replay-warehouse-91042/eventhubs/replay-ingest", apiVersion: "2024-01-01", expectedType: "Microsoft.EventHub/namespaces/eventhubs" },
    { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-replay-warehouse-91042", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
    { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-replay-warehouse-91042", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
    { label: "cosmos-account", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-replay-warehouse-91042", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts" },
    { label: "cosmos-database", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-replay-warehouse-91042/sqlDatabases/ReplayStateDb", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases" },
    { label: "cosmos-container", provider: "Microsoft.DocumentDB", typePath: "databaseAccounts/cosmos-replay-warehouse-91042/sqlDatabases/ReplayStateDb/containers/ReplayState", apiVersion: "2024-05-15", expectedType: "Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers" },
    { label: "synapse-workspace", provider: "Microsoft.Synapse", typePath: "workspaces/syn-replay-warehouse-91042", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces" },
    { label: "synapse-sql-pool", provider: "Microsoft.Synapse", typePath: "workspaces/syn-replay-warehouse-91042/sqlPools/replaypool", apiVersion: "2021-06-01", expectedType: "Microsoft.Synapse/workspaces/sqlPools" },
    { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-replay-warehouse-91042", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
    { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-replay-warehouse-91042/apis/replay-warehouse-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
    { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-replay-warehouse-91042/products/replay-warehouse-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
    { label: "api-management-product-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-replay-warehouse-91042/products/replay-warehouse-product/apis/replay-warehouse-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products/apis" },
    { label: "api-management-operation", provider: "Microsoft.ApiManagement", typePath: "service/apim-replay-warehouse-91042/apis/replay-warehouse-api/operations/replay-batch", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations" },
    { label: "api-management-operation-policy", provider: "Microsoft.ApiManagement", typePath: "service/apim-replay-warehouse-91042/apis/replay-warehouse-api/operations/replay-batch/policies/policy", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations/policies" },
    { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-warehouse-91042", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
    { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-warehouse-91042/topics/replay-commands", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
    { label: "service-bus-subscription-ingest", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-warehouse-91042/topics/replay-commands/subscriptions/ingest", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-reconcile", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-replay-warehouse-91042/topics/replay-commands/subscriptions/reconcile", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azreplaywh91042", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
    { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azreplaywh91042/blobServices/default/containers/replay-drop", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
    { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azreplaywh91042/fileServices/default/shares/replay-stage", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
    { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-replay-warehouse-91042", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
    { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-rply-wh-91042", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
    { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-replay-warehouse-91042", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
    { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-replay-warehouse-91042", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
    { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-replay-warehouse-91042", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
    { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-replay-warehouse-91042", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
    { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-replay-warehouse-91042", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-replay-warehouse-91042", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
  ],
});

scenarios.push({
  poId: "adff7aa8-2fd8-4170-b802-63164f6d3485",
  prId: "Pr91045",
  scenarioId: "global-exception-governance-ring",
  title: "Global exception governance ring",
  prompt: [
    "Our regulated partner governance team wants one Azure deployment that can take exception requests from a global edge, route them through one governed API surface, execute a long-running approval workflow, hold hot entitlement state, keep mutable case state, persist evidence packages, publish downstream command notifications, and keep all of the shared secret, configuration, and observability services in the same environment. The project skeleton already exists and I only need the infrastructure implementation in `lib/tap-stack.ts`. Write this in Pulumi Azure TypeScript for `eastus`.",
    "",
    "Put Azure Front Door in front of Azure API Management, attach a WAF policy to the Front Door surface through a security policy, back the approval API with one Azure Function App, add one Azure Logic App workflow for escalations and audit fan-out, use Azure Database for PostgreSQL Flexible Server for mutable case state, use Azure Cache for Redis for hot decision state, use one Service Bus namespace with one topic and one `risk` subscription and one `finance` subscription and one `ops` subscription for downstream command processing, use one Blob Storage account with one blob container and one Azure Files share for evidence retention, publish downstream business notifications through one Event Grid topic, keep one public DNS zone with one CNAME record for the API edge, store shared secrets in one Key Vault, keep runtime configuration in one App Configuration store, and route diagnostics into one Log Analytics workspace and one Application Insights component.",
    "",
    "Use these exact resource names: resource group `rg-az-exception-governance-pulumi-91045`, Front Door profile `afd-exception-governance-91045`, Front Door endpoint `exception-governance-endpoint`, Front Door origin group `exception-governance-origins`, Front Door origin `exception-governance-origin`, Front Door route `exception-governance-route`, Front Door security policy `exception-governance-security-policy`, WAF policy `waf-exception-governance-91045`, public DNS zone `exception91045.contoso.net`, public DNS CNAME record `api`, API Management service `apim-exception-governance-91045`, API Management API `exception-governance-api`, API Management product `exception-governance-product`, API Management operation `approve-exception`, Function App plan `plan-exception-governance-91045`, Function App `func-exception-governance-91045`, Logic App workflow `la-exception-governance-91045`, PostgreSQL server `pg-exception-governance-91045`, PostgreSQL database `exceptiondb`, Redis cache `redis-exception-governance-91045`, Service Bus namespace `sb-exception-governance-91045`, Service Bus topic `exception-events`, Service Bus subscriptions `risk`, `finance`, and `ops`, storage account `azexceptiongov91045`, blob container `exception-evidence`, Azure Files share `exception-archive`, Event Grid topic `eg-exception-governance-91045`, Key Vault `kv-exc-gov-91045`, App Configuration store `cfg-exception-governance-91045`, action group `ag-exception-governance-91045`, metric alert `ma-exception-governance-91045`, activity log alert `ala-exception-governance-91045`, Log Analytics workspace `log-exception-governance-91045`, and Application Insights component `appi-exception-governance-91045`.",
    "",
    "Keep this limited to the exception governance ring. Do not add AKS, Application Gateway, private DNS, private endpoints, MySQL, Cosmos DB, Synapse, or Database Migration Service.",
    "",
    "The Pulumi entry point, project files, tests, and shipment wiring already exist. I only need `lib/tap-stack.ts`. The implementation must export `createTapStack` and it must export exactly these output keys: `ExceptionGovernanceFrontDoorHostName`, `ExceptionGovernancePublicDnsZoneName`, `ExceptionGovernanceApiGatewayUrl`, `ExceptionGovernanceFunctionHostName`, `ExceptionGovernanceLogicWorkflowName`, `ExceptionGovernancePostgresServerName`, `ExceptionGovernancePostgresDatabaseName`, `ExceptionGovernanceRedisName`, `ExceptionGovernanceTopicName`, `ExceptionGovernanceRiskSubscriptionName`, `ExceptionGovernanceFinanceSubscriptionName`, `ExceptionGovernanceOpsSubscriptionName`, `ExceptionGovernanceStorageAccountName`, `ExceptionGovernanceBlobContainerName`, `ExceptionGovernanceFileShareName`, `ExceptionGovernanceEventGridTopicEndpoint`, `ExceptionGovernanceKeyVaultName`, `ExceptionGovernanceAppConfigName`, `ExceptionGovernanceActionGroupName`, `ExceptionGovernanceMetricAlertName`, `ExceptionGovernanceActivityLogAlertName`, `ExceptionGovernanceLogAnalyticsWorkspaceName`, `ExceptionGovernanceAppInsightsName`. Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\" and no prose before or after it.",
  ].join("\n"),
  fieldReferences: [
    {
      title: "Configure Azure Front Door in front of Azure API Management",
      url: "https://learn.microsoft.com/en-us/azure/api-management/front-door-api-management",
      why: "Grounds the secure global API edge with Front Door, API Management, and WAF.",
    },
    {
      title: "Respond to Azure Service Bus events received using Azure Event Grid by using Azure Logic Apps",
      url: "https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-to-event-grid-integration-example",
      why: "Grounds the long-running approval workflow and event-driven escalation path across Service Bus, Event Grid, and Logic Apps.",
    },
    {
      title: "Connect to Azure Service Bus from workflows in Azure Logic Apps",
      url: "https://learn.microsoft.com/en-us/azure/connectors/connectors-create-api-servicebus",
      why: "Grounds workflow-side Service Bus interactions for downstream approval and escalation handling.",
    },
  ],
  resourceNames: {
    resourceGroup: "rg-az-exception-governance-pulumi-91045",
    frontDoorProfile: "afd-exception-governance-91045",
    frontDoorEndpoint: "exception-governance-endpoint",
    frontDoorOriginGroup: "exception-governance-origins",
    frontDoorOrigin: "exception-governance-origin",
    frontDoorRoute: "exception-governance-route",
    frontDoorSecurityPolicy: "exception-governance-security-policy",
    wafPolicy: "waf-exception-governance-91045",
    publicDnsZone: "exception91045.contoso.net",
    publicDnsRecord: "api",
    apiManagementService: "apim-exception-governance-91045",
    apiManagementApi: "exception-governance-api",
    apiManagementProduct: "exception-governance-product",
    apiManagementOperation: "approve-exception",
    functionAppPlan: "plan-exception-governance-91045",
    functionApp: "func-exception-governance-91045",
    logicWorkflow: "la-exception-governance-91045",
    postgresServer: "pg-exception-governance-91045",
    postgresDatabase: "exceptiondb",
    redisCache: "redis-exception-governance-91045",
    serviceBusNamespace: "sb-exception-governance-91045",
    serviceBusTopic: "exception-events",
    riskSubscription: "risk",
    financeSubscription: "finance",
    opsSubscription: "ops",
    storageAccount: "azexceptiongov91045",
    blobContainer: "exception-evidence",
    fileShare: "exception-archive",
    eventGridTopic: "eg-exception-governance-91045",
    keyVault: "kv-exc-gov-91045",
    appConfigStore: "cfg-exception-governance-91045",
    actionGroup: "ag-exception-governance-91045",
    metricAlert: "ma-exception-governance-91045",
    activityLogAlert: "ala-exception-governance-91045",
    logAnalyticsWorkspace: "log-exception-governance-91045",
    applicationInsights: "appi-exception-governance-91045",
  },
  expectedOutputKeys: [
    "ExceptionGovernanceFrontDoorHostName",
    "ExceptionGovernancePublicDnsZoneName",
    "ExceptionGovernanceApiGatewayUrl",
    "ExceptionGovernanceFunctionHostName",
    "ExceptionGovernanceLogicWorkflowName",
    "ExceptionGovernancePostgresServerName",
    "ExceptionGovernancePostgresDatabaseName",
    "ExceptionGovernanceRedisName",
    "ExceptionGovernanceTopicName",
    "ExceptionGovernanceRiskSubscriptionName",
    "ExceptionGovernanceFinanceSubscriptionName",
    "ExceptionGovernanceOpsSubscriptionName",
    "ExceptionGovernanceStorageAccountName",
    "ExceptionGovernanceBlobContainerName",
    "ExceptionGovernanceFileShareName",
    "ExceptionGovernanceEventGridTopicEndpoint",
    "ExceptionGovernanceKeyVaultName",
    "ExceptionGovernanceAppConfigName",
    "ExceptionGovernanceActionGroupName",
    "ExceptionGovernanceMetricAlertName",
    "ExceptionGovernanceActivityLogAlertName",
    "ExceptionGovernanceLogAnalyticsWorkspaceName",
    "ExceptionGovernanceAppInsightsName",
  ],
  requiredSourceMarkers: [
    "cdn.Profile",
    "cdn.AFDEndpoint",
    "cdn.AFDOriginGroup",
    "cdn.AFDOrigin",
    "cdn.Route",
    "cdn.SecurityPolicy",
    "frontdoor.Policy",
    "dns.Zone",
    "dns.RecordSet",
    "apimanagement.",
    "web.",
    "logic.",
    "dbforpostgresql.",
    "redis.Redis",
    "servicebus.",
    "storage.BlobContainer",
    "storage.FileShare",
    "eventgrid.",
    "keyvault.",
    "appconfiguration.",
    "monitor.ActionGroup",
    "monitor.MetricAlert",
    "monitor.ActivityLogAlert",
    "operationalinsights.",
    "applicationinsights.Component",
    "approve-exception",
    "exception-events",
  ],
  forbiddenSourceMarkers: ["containerservice", "network.ApplicationGateway", "privateDnsZones", "private endpoint", "dbformysql", "documentdb", "synapse.", "datamigration"],
  integrationChecks: [
    { label: "front-door-profile", provider: "Microsoft.Cdn", typePath: "profiles/afd-exception-governance-91045", apiVersion: "2024-09-01", expectedType: "Microsoft.Cdn/profiles" },
    { label: "front-door-endpoint", provider: "Microsoft.Cdn", typePath: "profiles/afd-exception-governance-91045/afdEndpoints/exception-governance-endpoint", apiVersion: "2024-09-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints" },
    { label: "front-door-origin-group", provider: "Microsoft.Cdn", typePath: "profiles/afd-exception-governance-91045/originGroups/exception-governance-origins", apiVersion: "2024-09-01", expectedType: "Microsoft.Cdn/profiles/originGroups" },
    { label: "front-door-origin", provider: "Microsoft.Cdn", typePath: "profiles/afd-exception-governance-91045/originGroups/exception-governance-origins/origins/exception-governance-origin", apiVersion: "2024-09-01", expectedType: "Microsoft.Cdn/profiles/originGroups/origins" },
    { label: "front-door-route", provider: "Microsoft.Cdn", typePath: "profiles/afd-exception-governance-91045/afdEndpoints/exception-governance-endpoint/routes/exception-governance-route", apiVersion: "2024-09-01", expectedType: "Microsoft.Cdn/profiles/afdEndpoints/routes" },
    { label: "front-door-security-policy", provider: "Microsoft.Cdn", typePath: "profiles/afd-exception-governance-91045/securityPolicies/exception-governance-security-policy", apiVersion: "2024-09-01", expectedType: "Microsoft.Cdn/profiles/securityPolicies" },
    { label: "waf-policy", provider: "Microsoft.Network", typePath: "FrontDoorWebApplicationFirewallPolicies/waf-exception-governance-91045", apiVersion: "2023-09-01", expectedType: "Microsoft.Network/FrontDoorWebApplicationFirewallPolicies" },
    { label: "public-dns-zone", provider: "Microsoft.Network", typePath: "dnsZones/exception91045.contoso.net", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones" },
    { label: "public-dns-record", provider: "Microsoft.Network", typePath: "dnsZones/exception91045.contoso.net/CNAME/api", apiVersion: "2018-05-01", expectedType: "Microsoft.Network/dnsZones/CNAME" },
    { label: "api-management-service", provider: "Microsoft.ApiManagement", typePath: "service/apim-exception-governance-91045", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service" },
    { label: "api-management-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-exception-governance-91045/apis/exception-governance-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis" },
    { label: "api-management-product", provider: "Microsoft.ApiManagement", typePath: "service/apim-exception-governance-91045/products/exception-governance-product", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products" },
    { label: "api-management-product-api", provider: "Microsoft.ApiManagement", typePath: "service/apim-exception-governance-91045/products/exception-governance-product/apis/exception-governance-api", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/products/apis" },
    { label: "api-management-operation", provider: "Microsoft.ApiManagement", typePath: "service/apim-exception-governance-91045/apis/exception-governance-api/operations/approve-exception", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations" },
    { label: "api-management-operation-policy", provider: "Microsoft.ApiManagement", typePath: "service/apim-exception-governance-91045/apis/exception-governance-api/operations/approve-exception/policies/policy", apiVersion: "2022-08-01", expectedType: "Microsoft.ApiManagement/service/apis/operations/policies" },
    { label: "function-plan", provider: "Microsoft.Web", typePath: "serverfarms/plan-exception-governance-91045", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/serverfarms" },
    { label: "function-app", provider: "Microsoft.Web", typePath: "sites/func-exception-governance-91045", apiVersion: "2023-12-01", expectedType: "Microsoft.Web/sites" },
    { label: "logic-workflow", provider: "Microsoft.Logic", typePath: "workflows/la-exception-governance-91045", apiVersion: "2019-05-01", expectedType: "Microsoft.Logic/workflows" },
    { label: "postgres-server", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-exception-governance-91045", apiVersion: "2022-12-01", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers" },
    { label: "postgres-database", provider: "Microsoft.DBforPostgreSQL", typePath: "flexibleServers/pg-exception-governance-91045/databases/exceptiondb", apiVersion: "2022-12-01", expectedType: "Microsoft.DBforPostgreSQL/flexibleServers/databases" },
    { label: "redis-cache", provider: "Microsoft.Cache", typePath: "redis/redis-exception-governance-91045", apiVersion: "2023-08-01", expectedType: "Microsoft.Cache/redis" },
    { label: "service-bus-namespace", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-exception-governance-91045", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces" },
    { label: "service-bus-topic", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-exception-governance-91045/topics/exception-events", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics" },
    { label: "service-bus-subscription-risk", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-exception-governance-91045/topics/exception-events/subscriptions/risk", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-finance", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-exception-governance-91045/topics/exception-events/subscriptions/finance", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "service-bus-subscription-ops", provider: "Microsoft.ServiceBus", typePath: "namespaces/sb-exception-governance-91045/topics/exception-events/subscriptions/ops", apiVersion: "2021-11-01", expectedType: "Microsoft.ServiceBus/namespaces/topics/subscriptions" },
    { label: "storage-account", provider: "Microsoft.Storage", typePath: "storageAccounts/azexceptiongov91045", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts" },
    { label: "blob-container", provider: "Microsoft.Storage", typePath: "storageAccounts/azexceptiongov91045/blobServices/default/containers/exception-evidence", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/blobServices/containers" },
    { label: "file-share", provider: "Microsoft.Storage", typePath: "storageAccounts/azexceptiongov91045/fileServices/default/shares/exception-archive", apiVersion: "2023-01-01", expectedType: "Microsoft.Storage/storageAccounts/fileServices/shares" },
    { label: "event-grid-topic", provider: "Microsoft.EventGrid", typePath: "topics/eg-exception-governance-91045", apiVersion: "2022-06-15", expectedType: "Microsoft.EventGrid/topics" },
    { label: "key-vault", provider: "Microsoft.KeyVault", typePath: "vaults/kv-exc-gov-91045", apiVersion: "2023-07-01", expectedType: "Microsoft.KeyVault/vaults" },
    { label: "app-config", provider: "Microsoft.AppConfiguration", typePath: "configurationStores/cfg-exception-governance-91045", apiVersion: "2023-03-01", expectedType: "Microsoft.AppConfiguration/configurationStores" },
    { label: "action-group", provider: "Microsoft.Insights", typePath: "actionGroups/ag-exception-governance-91045", apiVersion: "2023-01-01", expectedType: "Microsoft.Insights/actionGroups" },
    { label: "metric-alert", provider: "Microsoft.Insights", typePath: "metricAlerts/ma-exception-governance-91045", apiVersion: "2018-03-01", expectedType: "Microsoft.Insights/metricAlerts" },
    { label: "activity-log-alert", provider: "Microsoft.Insights", typePath: "activityLogAlerts/ala-exception-governance-91045", apiVersion: "2020-10-01", expectedType: "Microsoft.Insights/activityLogAlerts" },
    { label: "log-analytics", provider: "Microsoft.OperationalInsights", typePath: "workspaces/log-exception-governance-91045", apiVersion: "2022-10-01", expectedType: "Microsoft.OperationalInsights/workspaces" },
    { label: "application-insights", provider: "Microsoft.Insights", typePath: "components/appi-exception-governance-91045", apiVersion: "2020-02-02", expectedType: "Microsoft.Insights/components" },
  ],
});

scenarios.push(...ultraExpertWave91046to91050);
scenarios.push(...ultraExpertWave91051to91055);
scenarios.push(...ultraExpertWave91056to91060);
scenarios.push(...ultraExpertWave91061to91065);
scenarios.push(...ultraExpertWave91066to91070);
scenarios.push(...ultraExpertWave91071to91075);
scenarios.push(...ultraExpertWave91076to91080);
scenarios.push(...ultraExpertWave91081to91085);
scenarios.push(...ultraExpertWave91086to91090);
scenarios.push(...ultraExpertWave91091to91095);
scenarios.push(...ultraExpertWave91096to91100);
scenarios.push(...ultraExpertWave91101to91105);

function validateScenarioDefinitions() {
  for (const scenario of scenarios) {
    const keyVaultName = scenario.resourceNames?.keyVault;
    if (typeof keyVaultName === 'string' && !/^[a-zA-Z0-9-]{3,24}$/.test(keyVaultName)) {
      throw new Error(`${scenario.prId} uses invalid Azure Key Vault name ${keyVaultName}`);
    }
  }
}

validateScenarioDefinitions();

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

function scenarioUsesAzureNativeV3(scenario) {
  // Keep the complex-bundle generator on the same Azure Native surface that the
  // runner, validator, and historical verified corpus already exercise heavily.
  // The v3 split introduced inconsistent guidance for Cosmos and IoT families
  // without buying us meaningful coverage.
  void scenario;
  return false;
}

function pulumiYaml() {
  return `name: tap-stack\nruntime: nodejs\nmain: bin/tap.ts\n`;
}

function packageJson(scenario) {
  const azureNativeVersion = scenarioUsesAzureNativeV3(scenario)
    ? "^3.18.0"
    : "^2.80.0";
  return `${JSON.stringify(
    {
      name: "tap-stack",
      private: true,
      main: "bin/tap.ts",
      dependencies: {
        "@pulumi/azure-native": azureNativeVersion,
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
const lowerStack = stack.toLowerCase();
const usesAzureNativeV3 = /^\\^?3\\./.test(String(packageJson.dependencies?.["@pulumi/azure-native"] ?? ""));

function sourceSatisfiesMarker(marker) {
  const normalizedMarker = String(marker ?? "").toLowerCase();
  if (lowerStack.includes(normalizedMarker)) return true;
  if (normalizedMarker === "frontdoor.policy") {
    return /\\bnetwork\\.webapplicationfirewallpolicy\\b/.test(lowerStack)
      || /\\bazure\\.network\\.webapplicationfirewallpolicy\\b/.test(lowerStack);
  }
  if (normalizedMarker === "dns.zone") {
    return usesAzureNativeV3
      ? /\\bdns\\.zone\\b/.test(lowerStack) || /\\bazure\\.dns\\.zone\\b/.test(lowerStack)
      : /\\bnetwork\\.zone\\b/.test(lowerStack) || /\\bazure\\.network\\.zone\\b/.test(lowerStack);
  }
  if (normalizedMarker === "dns.recordset") {
    return usesAzureNativeV3
      ? /\\bdns\\.recordset\\b/.test(lowerStack) || /\\bazure\\.dns\\.recordset\\b/.test(lowerStack)
      : /\\bnetwork\\.recordset\\b/.test(lowerStack) || /\\bazure\\.network\\.recordset\\b/.test(lowerStack);
  }
  if (normalizedMarker === "network.privatezone") {
    return usesAzureNativeV3
      ? /\\bprivatedns\\.privatezone\\b/.test(lowerStack) || /\\bazure\\.privatedns\\.privatezone\\b/.test(lowerStack)
      : /\\bnetwork\\.privatezone\\b/.test(lowerStack) || /\\bazure\\.network\\.privatezone\\b/.test(lowerStack);
  }
  if (normalizedMarker === "privatedns.privatezone") {
    return usesAzureNativeV3
      ? /\\bprivatedns\\.privatezone\\b/.test(lowerStack) || /\\bazure\\.privatedns\\.privatezone\\b/.test(lowerStack)
      : /\\bnetwork\\.privatezone\\b/.test(lowerStack) || /\\bazure\\.network\\.privatezone\\b/.test(lowerStack);
  }
  if (normalizedMarker === "privatedns.virtualnetworklink") {
    return usesAzureNativeV3
      ? /\\bprivatedns\\.virtualnetworklink\\b/.test(lowerStack) || /\\bazure\\.privatedns\\.virtualnetworklink\\b/.test(lowerStack)
      : /\\bnetwork\\.virtualnetworklink\\b/.test(lowerStack) || /\\bazure\\.network\\.virtualnetworklink\\b/.test(lowerStack);
  }
  if (normalizedMarker === "privatedns.privaterecordset") {
    return usesAzureNativeV3
      ? /\\bprivatedns\\.privaterecordset\\b/.test(lowerStack) || /\\bazure\\.privatedns\\.privaterecordset\\b/.test(lowerStack)
      : /\\bnetwork\\.privaterecordset\\b/.test(lowerStack) || /\\bazure\\.network\\.privaterecordset\\b/.test(lowerStack);
  }
  if (normalizedMarker === "cache.redis" || normalizedMarker === "redis.redis") {
    return usesAzureNativeV3
      ? /\\bredis\\.redis\\b/.test(lowerStack) || /\\bazure\\.redis\\.redis\\b/.test(lowerStack)
      : /\\bcache\\.redis\\b/.test(lowerStack) || /\\bazure\\.cache\\.redis\\b/.test(lowerStack);
  }
  if (normalizedMarker === "applicationinsights." || normalizedMarker === "applicationinsights.component") {
    return usesAzureNativeV3
      ? /\\bazure\\.applicationinsights\\.component\\b/.test(lowerStack) || /\\bapplicationinsights\\.component\\b/.test(lowerStack)
      : /\\bazure\\.insights\\.component\\b/.test(lowerStack) || /\\binsights\\.component\\b/.test(lowerStack);
  }
  if (normalizedMarker === "monitor.actiongroup") {
    return usesAzureNativeV3
      ? /\\bmonitor\\.actiongroup\\b/.test(lowerStack) || /\\bazure\\.monitor\\.actiongroup\\b/.test(lowerStack)
      : /\\binsights\\.actiongroup\\b/.test(lowerStack) || /\\bazure\\.insights\\.actiongroup\\b/.test(lowerStack);
  }
  if (normalizedMarker === "monitor.metricalert") {
    return usesAzureNativeV3
      ? /\\bmonitor\\.metricalert\\b/.test(lowerStack) || /\\bazure\\.monitor\\.metricalert\\b/.test(lowerStack)
      : /\\binsights\\.metricalert\\b/.test(lowerStack) || /\\bazure\\.insights\\.metricalert\\b/.test(lowerStack);
  }
  if (normalizedMarker === "monitor.activitylogalert") {
    return usesAzureNativeV3
      ? /\\bmonitor\\.activitylogalert\\b/.test(lowerStack) || /\\bazure\\.monitor\\.activitylogalert\\b/.test(lowerStack)
      : /\\binsights\\.activitylogalert\\b/.test(lowerStack) || /\\bazure\\.insights\\.activitylogalert\\b/.test(lowerStack);
  }
  if (normalizedMarker === "devices.") {
    return /\\bdevices\\./.test(lowerStack)
      || /\\biothub\\./.test(lowerStack)
      || /\\bazure\\.devices\\./.test(lowerStack);
  }
  return false;
}

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
  if (!sourceSatisfiesMarker(marker)) {
    throw new Error(\`lib/tap-stack.ts is missing required scenario marker \${marker}\`);
  }
}

for (const forbidden of metadata.forbiddenSourceMarkers ?? []) {
  if (stack.toLowerCase().includes(String(forbidden).toLowerCase())) {
    throw new Error(\`lib/tap-stack.ts contains forbidden marker \${forbidden}\`);
  }
}

if (metadata.integrationChecks?.some((check) => check.expectedType === "Microsoft.Network/FrontDoorWebApplicationFirewallPolicies")) {
  const hasFrontDoorWaf = stack.includes("network.WebApplicationFirewallPolicy")
    || stack.includes("azure.network.WebApplicationFirewallPolicy");
  if (!hasFrontDoorWaf) {
    throw new Error("Front Door WAF scenarios must declare a Front Door WAF policy resource");
  }
}

console.log("unit assertions passed");
`;
}

export function integrationTest() {
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

for (const [outputKey, outputValue] of Object.entries(rawOutputs)) {
  if (typeof outputValue !== "string") {
    continue;
  }
  if ((outputKey.endsWith("Url") || outputKey.endsWith("Endpoint"))
    && (!outputValue.startsWith("https://") || outputValue.includes("https://https://"))) {
    throw new Error(\`invalid URL output \${outputKey}: \${outputValue}\`);
  }
  if (outputKey.endsWith("HostName") && /^https?:\\/\\//i.test(outputValue)) {
    throw new Error(\`invalid host output \${outputKey}: \${outputValue}\`);
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
  if (check.expectedType === "Microsoft.ApiManagement/service/products/apis") {
    return check.typePath.split("/").filter(Boolean).at(-1);
  }
  return check.typePath
    .split("/")
    .filter((_, index) => index % 2 === 1)
    .join("/");
}

function expectedArmType(check) {
  if (check.expectedType === "Microsoft.ApiManagement/service/products/apis") {
    return "Microsoft.ApiManagement/service/apis";
  }
  return check.expectedType;
}

for (const check of metadata.integrationChecks) {
  const url = \`\${endpoint}/subscriptions/\${subscriptionId}/resourceGroups/\${resourceGroup}/providers/\${check.provider}/\${check.typePath}?api-version=\${check.apiVersion}\`;
  const payload = await getJson(url);
  if (payload.name !== expectedArmName(check)) {
    throw new Error(\`unexpected resource name for \${check.label}: \${payload.name}\`);
  }
  if (payload.type !== expectedArmType(check)) {
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
  const usesAzureNativeV3 = scenarioUsesAzureNativeV3(scenario);
  const hasPublicDns = scenarioUsesPublicDns(scenario);
  const hasPrivateDns = scenarioUsesPrivateDns(scenario);
  const hints = [
    "You are generating the missing Pulumi implementation for an Azure IaC task.",
    "Return exactly one Markdown fenced code block with path=\"lib/tap-stack.ts\".",
    "Do not return any prose before or after the fenced code block.",
    usesAzureNativeV3
      ? "Use only APIs and resource classes that exist in @pulumi/azure-native v3.18.0."
      : "Use only APIs and resource classes that exist in the Azure Native 2.x surface shipped by this bundle (dependency range ^2.80.0, currently resolving to 2.92.2 in the runner).",
    "The task must be fully self-contained. Do not require Pulumi stack config, environment variables, or manual operator input for names, passwords, or secrets.",
    "Do not use new pulumi.Config(), config.require(...), config.requireSecret(...), or config.getSecret(...) in this file. Use deterministic, strong, prompt-scoped constants when credentials are required.",
    "When the stack creates a ResourceGroup, instantiate it first and pass resourceGroupName: resourceGroup.name to downstream resources instead of reusing the raw resource group string. That creates the correct dependency edge.",
    "Do not use @pulumi/random or any random suffix generation.",
    "For StorageAccount, use enableHttpsTrafficOnly rather than supportsHttpsTrafficOnly.",
    "For Azure Storage child resources such as BlobContainer, FileShare, Queue, and Table, do not pass the raw storage account name string. Use the created storage account resource output, for example accountName: storage.name, so Pulumi waits for the account to exist.",
    "When calling azure.storage.listStorageAccountKeysOutput, use accountName: storage.name rather than the raw prompt-fixed string so the invoke waits for the storage account resource.",
    "For Azure private DNS child resources such as VirtualNetworkLink and PrivateRecordSet, do not rely on a raw privateZoneName string to order creation. Add explicit dependsOn: [privateZone] to every private DNS link and private DNS record set.",
    "Do not invent unsupported convenience properties on Azure Database for PostgreSQL Flexible Server.",
    "When using azure.apimanagement.ProductApi, pass the prompt-fixed productId and apiId string identifiers directly; do not read .productId or .apiId from created resources.",
    "If a constructor input expects a fixed Azure identifier like apiId, productId, endpointName, queueName, or topicName, prefer the prompt-fixed string instead of reading a non-existent output property.",
    "When using operationalinsights.getWorkspaceSharedKeysOutput, do not access .primarySharedKey directly on the Output. Derive it with workspaceKeys.apply(keys => keys.primarySharedKey ?? \"\") so strict TypeScript accepts it.",
    "When creating azure.servicebus.Subscription resources for a topic, add an explicit dependsOn: [topic] option so subscriptions are created only after the topic exists.",
    "For azure.keyvault.Vault, do not set tenantId or sku at the top level of VaultArgs in this repo. Put tenantId only inside properties.tenantId and put sku only inside properties.sku.",
    "In this repo's shipped Azure Native surface, VaultPropertiesArgs requires properties.sku. Keep sku inside the properties block and omit top-level sku from VaultArgs.",
    "For Event Grid custom topics in Azure Native, do not set a top-level sku unless the exact generated TopicArgs type proves it is accepted.",
    "For API Management Product in Azure Native, do not use a nonexistent published property. Use displayName and state, and only include properties that exist on ProductArgs.",
    "For API Management child resources, add explicit dependency edges: ProductApi should depend on both the Api and the Product, ApiOperation should depend on the Api, and ApiOperationPolicy should depend on the ApiOperation.",
    usesAzureNativeV3
      ? "For azure.applicationinsights.Component, use applicationType rather than ARM-style Application_Type."
      : "For azure.insights.Component, use applicationType rather than ARM-style Application_Type.",
    usesAzureNativeV3
      ? "For azure.applicationinsights.Component, set kind to web and set applicationType to web unless the prompt explicitly requires a different exact shape."
      : "For azure.insights.Component, set kind to web and set applicationType to web unless the prompt explicitly requires a different exact shape.",
    "For output keys ending in Url or Endpoint, emit a single well-formed https URL. Do not prepend https:// if the Azure Native property already includes the scheme.",
    "For output keys ending in HostName, emit the bare hostname without http:// or https://.",
    "For output keys ending in Name, emit the exact leaf resource name from the prompt rather than an ARM id, parent-qualified name, or path-like composite value.",
    "When an Azure Native property or invoke result is typed as pulumi.Output<string | undefined>, do not pass it directly to string-only inputs or outputs. Normalize it first with .apply((value: string | undefined) => value ?? \"\") or pulumi.interpolate so strict TypeScript accepts the code.",
    "For Function App consumption plans, create azure.web.AppServicePlan with sku Y1 / Dynamic. If you set kind, use functionapp. If you set reserved, use a boolean value. Do not invent unsupported plan properties.",
  ];

  if (scenarioUsesFrontDoor(scenario)) {
    hints.push("For Azure Front Door, use azure.cdn.Profile, AFDEndpoint, AFDOriginGroup, AFDOrigin, Route, and SecurityPolicy.");
    hints.push("For azure.cdn.Route, use originGroup, not origins. Keep enabledState, supportedProtocols, patternsToMatch, forwardingProtocol, httpsRedirect, and linkToDefaultDomain on the route.");
    hints.push("Azure Front Door child resources keyed only by profileName, endpointName, or originGroupName do not automatically create Pulumi graph dependencies. Add explicit dependsOn edges: AFDEndpoint and AFDOriginGroup depend on the Profile, each AFDOrigin depends on the AFDOriginGroup, Route depends on the AFDEndpoint plus its Origins, and SecurityPolicy depends on the endpoint or route plus the WAF policy.");
    hints.push("Do not rely on string parent names to order Azure Front Door resources. Use explicit dependsOn for the real parent-child creation sequence.");
    if (scenarioUsesFrontDoorWafPolicyResource(scenario)) {
      hints.push("This repo's shipped Azure Native runner uses the top-level azure import surface for these resources.");
      hints.push("For Front Door WAF in this runner, use azure.network.WebApplicationFirewallPolicy and attach it through azure.cdn.SecurityPolicy.");
      hints.push("Do not import nonexistent modules like @pulumi/azure-native/frontdoor in this repo.");
      hints.push("For azure.network.WebApplicationFirewallPolicy, keep managedRules, customRules, and policySettings. Do not add a top-level sku unless the generated WebApplicationFirewallPolicyArgs type explicitly accepts it.");
      hints.push("For azure.network.WebApplicationFirewallPolicy, use policySettings.state, not policySettings.enabledState.");
      hints.push("Do not set a top-level sku on azure.network.WebApplicationFirewallPolicy unless the generated WebApplicationFirewallPolicyArgs type accepts it. Prefer policySettings, customRules, and managedRules.");
      hints.push("Copy this Front Door WAF shape exactly in this repo unless the generated SDK types prove otherwise: new azure.network.WebApplicationFirewallPolicy(name, { policyName: name, resourceGroupName: rg.name, location: \"global\", policySettings: { state: \"Enabled\", mode: \"Prevention\" }, managedRules: { managedRuleSets: [{ ruleSetType: \"Microsoft_DefaultRuleSet\", ruleSetVersion: \"2.1\" }] } }); Do not add sku, enabledState, or legacy Front Door WAF classes.");
    } else {
      hints.push("For azure.network.WebApplicationFirewallPolicy, use policySettings.state, not policySettings.enabledState.");
      hints.push("Do not set a top-level sku on azure.network.WebApplicationFirewallPolicy unless the generated WebApplicationFirewallPolicyArgs type accepts it. Prefer policySettings, customRules, and managedRules.");
      hints.push("If the task uses a non-Front-Door WAF policy, create azure.network.WebApplicationFirewallPolicy and attach it through the appropriate downstream resource.");
    }
  }

  if (scenarioUsesApplicationGateway(scenario)) {
    hints.push("For Azure Application Gateway, use azure.network.ApplicationGateway and include frontendIPConfigurations, frontendPorts, backendAddressPools, backendHttpSettingsCollection, httpListeners, and requestRoutingRules.");
    hints.push("For internal-only Application Gateway deployments, use subnet.id on the frontend IP configuration instead of a public IP resource.");
    hints.push("Use Application Gateway v2 SKUs for production-grade deployments. Set sku.name and sku.tier to Standard_v2 or WAF_v2.");
    hints.push("Do not reference the ApplicationGateway resource variable inside its own constructor. Precompute child resource IDs from the fixed gateway name, subscription ID, and resource group name.");
    hints.push("Do not derive Application Gateway subnet ids from virtualNetwork.subnets.apply(...). When the prompt gives fixed VNet and subnet names, build deterministic subnet ARM ids from subscription id, resource group name, VNet name, and subnet name, then pass those ids into gatewayIPConfigurations.");
    hints.push("Application Gateway requires gatewayIPConfigurations with a subnet id that points at the prompt-fixed application gateway subnet. If that subnet reference is omitted or empty, Azure rejects the deployment.");
  }

  if (scenario.prompt.toLowerCase().includes('load balancer')) {
    hints.push("For Azure Load Balancer, use azure.network.LoadBalancer with frontendIPConfigurations, backendAddressPools, loadBalancingRules, and probes.");
    hints.push("For internal load balancers, put the frontend IP configuration on a subnet and use a fixed privateIPAddress.");
  }

  if (hasPublicDns) {
    hints.push(usesAzureNativeV3
      ? "For Azure public DNS, use azure.dns.Zone for the DNS zone and azure.dns.RecordSet for public DNS records."
      : "For Azure public DNS, use azure.network.Zone for the DNS zone and azure.network.RecordSet for public DNS records.");
    hints.push("Azure public DNS zones must use location \"global\".");
    hints.push("For public DNS record sets, use the prompt-fixed zone name, relative record names like east or api, and the correct public record type such as A or CNAME.");
    hints.push(usesAzureNativeV3
      ? "Do not import @pulumi/azure-native/network and then call network.Zone or network.RecordSet. For DNS resources, prefer a single top-level import like import * as azure from \"@pulumi/azure-native\" and then use azure.dns.Zone and azure.dns.RecordSet."
      : "For this bundle's Azure Native 2.x surface, prefer a single top-level import like import * as azure from \"@pulumi/azure-native\" and then use azure.network.Zone and azure.network.RecordSet for public DNS.");
  }

  if (hasPrivateDns) {
    hints.push(usesAzureNativeV3
      ? "For Azure Private DNS, use azure.privatedns.PrivateZone, azure.privatedns.VirtualNetworkLink, and azure.privatedns.PrivateRecordSet resources with prompt-fixed zone and record names."
      : "For Azure Private DNS in this bundle's Azure Native 2.x surface, use azure.network.PrivateZone, azure.network.VirtualNetworkLink, and azure.network.PrivateRecordSet resources with prompt-fixed zone and record names.");
    hints.push(usesAzureNativeV3
      ? "Do not import @pulumi/azure-native/network and then call network.PrivateZone, network.VirtualNetworkLink, or network.PrivateRecordSet. For private DNS resources, prefer a single top-level import like import * as azure from \"@pulumi/azure-native\" and then use azure.privatedns.PrivateZone, azure.privatedns.VirtualNetworkLink, and azure.privatedns.PrivateRecordSet."
      : "For this bundle's Azure Native 2.x surface, prefer a single top-level import like import * as azure from \"@pulumi/azure-native\" and then use azure.network.PrivateZone, azure.network.VirtualNetworkLink, and azure.network.PrivateRecordSet for private DNS.");
  }

  if (hasPublicDns && hasPrivateDns) {
    hints.push(usesAzureNativeV3
      ? "This task uses both Azure public DNS and Azure Private DNS. Keep them separate: use azure.dns.Zone plus azure.dns.RecordSet only for the public zone, and use azure.privatedns.PrivateZone plus azure.privatedns.VirtualNetworkLink plus azure.privatedns.PrivateRecordSet only for the private zone."
      : "This task uses both Azure public DNS and Azure Private DNS on the Azure Native 2.x surface. Keep them separate: use azure.network.Zone plus azure.network.RecordSet only for the public zone, and use azure.network.PrivateZone plus azure.network.VirtualNetworkLink plus azure.network.PrivateRecordSet only for the private zone.");
    hints.push(usesAzureNativeV3
      ? "Do not use azure.dns.RecordSet against the private zone. Do not use azure.privatedns.PrivateRecordSet against the public zone."
      : "Do not use azure.network.RecordSet against the private zone. Do not use azure.network.PrivateRecordSet against the public zone.");
  }

  if (scenario.prompt.toLowerCase().includes('public ip')) {
    hints.push("For Azure Public IP resources, use azure.network.PublicIPAddress with Standard sku and a static allocation method unless the prompt explicitly says otherwise.");
  }

  if (scenario.prompt.toLowerCase().includes('aks') || scenario.prompt.toLowerCase().includes('managed cluster')) {
    hints.push("For AKS, use azure.containerservice.ManagedCluster with SystemAssigned identity, explicit dnsPrefix values, and distinct regional names.");
    hints.push("Do not use Fleet or unsupported AKS convenience surfaces unless the prompt explicitly asks for them.");
    hints.push("For AKS networkProfile, use serviceCidr, dnsServiceIP, networkPlugin, loadBalancerSku, and outboundType. Do not use dockerBridgeCidr.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('documentdb.'))) {
    hints.push("For Azure Cosmos DB SQL API in Azure Native, use azure.documentdb.DatabaseAccount, SqlResourceSqlDatabase, and SqlResourceSqlContainer.");
    hints.push("For Cosmos SQL database and container resources, pass accountName, databaseName, and containerName explicitly and keep the resource.id fields aligned to those exact names.");
    hints.push("Parent names do not create Pulumi ordering for Cosmos SQL containers. Every azure.documentdb.SqlResourceSqlContainer must include an explicit dependsOn: [sqlDatabase] option so the container is created only after its SQL database exists.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('devices.'))) {
    hints.push("For Azure IoT Hub in Azure Native, use IotHubResource. In Front Door / v3-style tasks, import iothub from @pulumi/azure-native/iothub and use iothub.IotHubResource. In top-level v2 tasks, azure.devices.IotHubResource is acceptable.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('digitaltwins'))) {
    hints.push("For Azure Digital Twins in Azure Native, use azure.digitaltwins.DigitalTwin with resourceName and location.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('managedidentity.'))) {
    hints.push("For a user-assigned managed identity in Azure Native, use azure.managedidentity.UserAssignedIdentity with resourceName and location.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('synapse.'))) {
    hints.push("For Azure Synapse in Azure Native, use azure.synapse.Workspace and azure.synapse.SqlPool.");
    hints.push("Synapse Workspace requires defaultDataLakeStorage.accountUrl and defaultDataLakeStorage.filesystem. Make that filesystem depend on an existing blob container or file-system-like storage child resource before the workspace is created.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('dbforpostgresql.'))) {
    hints.push("For Azure Database for PostgreSQL Flexible Server in Azure Native, use azure.dbforpostgresql.Server and azure.dbforpostgresql.Database. Do not use a nonexistent FlexibleServer class.");
    hints.push("Use resourceGroupName, serverName, location, administratorLogin, administratorLoginPassword, version, sku, storage, and backup on azure.dbforpostgresql.Server.");
    hints.push("For azure.dbforpostgresql.Database, set both charset and collation explicitly.");
  }

  if (scenario.requiredSourceMarkers.some((marker) => {
    const normalizedMarker = String(marker).toLowerCase();
    return normalizedMarker.includes('cache.redis') || normalizedMarker.includes('redis.redis');
  })) {
    hints.push(usesAzureNativeV3
      ? "For Azure Cache for Redis in this repo, use azure.redis.Redis. Do not use azure.cache.Redis."
      : "For Azure Cache for Redis in this repo's Azure Native 2.x surface, use azure.cache.Redis.");
  }

  if (scenario.prompt.toLowerCase().includes('action group')
    || scenario.prompt.toLowerCase().includes('metric alert')
    || scenario.prompt.toLowerCase().includes('activity log alert')) {
    hints.push(usesAzureNativeV3
      ? "For Azure Monitor alerting, use azure.monitor.ActionGroup, azure.monitor.MetricAlert, and azure.monitor.ActivityLogAlert when the prompt asks for them."
      : "For Azure Monitor alerting in this bundle's Azure Native 2.x surface, use azure.insights.ActionGroup, azure.insights.MetricAlert, and azure.insights.ActivityLogAlert.");
    hints.push("ActionGroup requires actionGroupName and groupShortName. MetricAlert requires scopes plus a criteria block. ActivityLogAlert requires scopes, condition, an actions block that references the action group, and location set to global.");
    hints.push(usesAzureNativeV3
      ? "For azure.monitor.MetricAlert criteria in Azure Native, do not pass raw ARM fields like \"odata.type\". Use the typed criteria shape accepted by MetricAlertArgs."
      : "For azure.insights.MetricAlert criteria in Azure Native, do not pass raw ARM fields like \"odata.type\". Use the typed criteria shape accepted by MetricAlertArgs.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('applicationinsights.'))) {
    hints.push(usesAzureNativeV3
      ? "This task must include an Application Insights component. Use azure.applicationinsights.Component in this repo."
      : "This task must include an Application Insights component. Use azure.insights.Component in this repo's Azure Native 2.x surface.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('apimanagement'))) {
    hints.push("For API Management, use azure.apimanagement.ApiManagementService, Api, Product, and ProductApi. Do not use a nonexistent azure.apimanagement.Service class.");
    hints.push("ApiManagementService requires resourceGroupName, serviceName, location, publisherEmail, publisherName, and sku. Use Developer or Consumption sku names that exist in Azure Native.");
    hints.push("When the prompt names an explicit API operation, create azure.apimanagement.ApiOperation with the prompt-fixed operationId and add azure.apimanagement.ApiOperationPolicy with policyId set to policy.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('dbformysql.'))) {
    hints.push("For Azure Database for MySQL Flexible Server in Azure Native, use azure.dbformysql.Server and azure.dbformysql.Database. Do not use a nonexistent FlexibleServer class.");
    hints.push("Use resourceGroupName, serverName, location, administratorLogin, administratorLoginPassword, version, sku, storage, and backup on azure.dbformysql.Server.");
    hints.push("Do not set publicNetworkAccess on azure.dbformysql.Server unless the exact generated SDK type accepts it. For the current Azure Native MySQL ServerArgs shape here, omit publicNetworkAccess.");
  }

  if (scenario.requiredSourceMarkers.some(marker => String(marker).toLowerCase().includes('datamigration.'))) {
    hints.push("For azure.datamigration.Service, use groupName, serviceName, location, sku, and virtualSubnetId. Do not use resourceGroupName on this resource.");
    hints.push("Use Database Migration Service sku.name Standard_1vCore unless the prompt explicitly requires a different exact DMS sku.");
    hints.push("For azure.datamigration.Project, use groupName, serviceName, projectName, location, sourcePlatform, and targetPlatform. Do not use resourceGroupName on this resource.");
    hints.push("For azure.datamigration.Project, use Azure Native platform enum spellings. PostgreSql is a source platform. AzureDbForPostgreSql is the PostgreSQL target platform. AzureDbForMySql is the MySQL target platform.");
  }

  return hints;
}

function sourceSatisfiesMarker(tapStackText, marker) {
  const source = String(tapStackText ?? '').toLowerCase();
  const normalizedMarker = String(marker ?? '').toLowerCase();
  const usesAzureNativeV3 = scenarioUsesAzureNativeV3ByText(source);
  if (source.includes(normalizedMarker)) return true;
  if (normalizedMarker === 'frontdoor.policy') {
    return /\bnetwork\.webapplicationfirewallpolicy\b/.test(source)
      || /\bazure\.network\.webapplicationfirewallpolicy\b/.test(source);
  }
  if (normalizedMarker === 'dns.zone') {
    return usesAzureNativeV3
      ? /\bdns\.zone\b/.test(source) || /\bazure\.dns\.zone\b/.test(source)
      : /\bnetwork\.zone\b/.test(source) || /\bazure\.network\.zone\b/.test(source);
  }
  if (normalizedMarker === 'dns.recordset') {
    return usesAzureNativeV3
      ? /\bdns\.recordset\b/.test(source) || /\bazure\.dns\.recordset\b/.test(source)
      : /\bnetwork\.recordset\b/.test(source) || /\bazure\.network\.recordset\b/.test(source);
  }
  if (normalizedMarker === 'network.privatezone') {
    return usesAzureNativeV3
      ? /\bprivatedns\.privatezone\b/.test(source) || /\bazure\.privatedns\.privatezone\b/.test(source)
      : /\bnetwork\.privatezone\b/.test(source) || /\bazure\.network\.privatezone\b/.test(source);
  }
  if (normalizedMarker === 'privatedns.privatezone') {
    return usesAzureNativeV3
      ? /\bprivatedns\.privatezone\b/.test(source) || /\bazure\.privatedns\.privatezone\b/.test(source)
      : /\bnetwork\.privatezone\b/.test(source) || /\bazure\.network\.privatezone\b/.test(source);
  }
  if (normalizedMarker === 'privatedns.virtualnetworklink') {
    return usesAzureNativeV3
      ? /\bprivatedns\.virtualnetworklink\b/.test(source) || /\bazure\.privatedns\.virtualnetworklink\b/.test(source)
      : /\bnetwork\.virtualnetworklink\b/.test(source) || /\bazure\.network\.virtualnetworklink\b/.test(source);
  }
  if (normalizedMarker === 'privatedns.privaterecordset') {
    return usesAzureNativeV3
      ? /\bprivatedns\.privaterecordset\b/.test(source) || /\bazure\.privatedns\.privaterecordset\b/.test(source)
      : /\bnetwork\.privaterecordset\b/.test(source) || /\bazure\.network\.privaterecordset\b/.test(source);
  }
  if (normalizedMarker === 'cache.redis' || normalizedMarker === 'redis.redis') {
    return usesAzureNativeV3
      ? /\bredis\.redis\b/.test(source) || /\bazure\.redis\.redis\b/.test(source)
      : /\bcache\.redis\b/.test(source) || /\bazure\.cache\.redis\b/.test(source);
  }
  if (normalizedMarker === 'applicationinsights.' || normalizedMarker === 'applicationinsights.component') {
    return usesAzureNativeV3
      ? /\bazure\.applicationinsights\.component\b/.test(source) || /\bapplicationinsights\.component\b/.test(source)
      : /\bazure\.insights\.component\b/.test(source) || /\binsights\.component\b/.test(source);
  }
  if (normalizedMarker === 'monitor.actiongroup') {
    return usesAzureNativeV3
      ? /\bmonitor\.actiongroup\b/.test(source) || /\bazure\.monitor\.actiongroup\b/.test(source)
      : /\binsights\.actiongroup\b/.test(source) || /\bazure\.insights\.actiongroup\b/.test(source);
  }
  if (normalizedMarker === 'monitor.metricalert') {
    return usesAzureNativeV3
      ? /\bmonitor\.metricalert\b/.test(source) || /\bazure\.monitor\.metricalert\b/.test(source)
      : /\binsights\.metricalert\b/.test(source) || /\bazure\.insights\.metricalert\b/.test(source);
  }
  if (normalizedMarker === 'monitor.activitylogalert') {
    return usesAzureNativeV3
      ? /\bmonitor\.activitylogalert\b/.test(source) || /\bazure\.monitor\.activitylogalert\b/.test(source)
      : /\binsights\.activitylogalert\b/.test(source) || /\bazure\.insights\.activitylogalert\b/.test(source);
  }
  if (normalizedMarker === 'devices.') {
    return /\bdevices\./.test(source)
      || /\biothub\./.test(source)
      || /\bazure\.devices\./.test(source);
  }
  return false;
}

function openAiInput(scenario, prompt) {
  return [
    ...generationHints(scenario),
    prompt,
  ].join("\n");
}

function scenarioUsesAzureNativeV3ByText(source) {
  return /\b(?:azure\.)?dns\./.test(source)
    || /\b(?:azure\.)?privatedns\./.test(source)
    || /\b(?:azure\.)?applicationinsights\./.test(source)
    || /\b(?:azure\.)?redis\.redis\b/.test(source)
    || /\b(?:azure\.)?monitor\.(?:actiongroup|metricalert|activitylogalert)\b/.test(source);
}

function extractCodeBlocks(markdown) {
  const blocks = [];
  const pattern = /```([^\n]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push({
      header: match[1] ?? "",
      content: match[2] ?? "",
    });
  }
  return blocks;
}

function normalizeTapStack(text) {
  return text.trim().replace(/^\uFEFF/, "").trimEnd() + "\n";
}

function looksLikeTapStack(content) {
  return /export\s+function\s+createTapStack\b/.test(content)
    || (/from\s+['"]@pulumi\/azure-native['"]/.test(content)
      && /createTapStack/.test(content));
}

function scoreTapStackBlock(block) {
  let score = 0;
  if (/path=["']lib\/tap-stack\.ts["']/i.test(block.header)) score += 100;
  if (/lib\/tap-stack\.ts/i.test(block.header)) score += 40;
  if (/\b(ts|typescript)\b/i.test(block.header)) score += 10;
  if (looksLikeTapStack(block.content)) score += 60;
  if (/from\s+['"]@pulumi\/pulumi['"]/.test(block.content)) score += 10;
  if (/from\s+['"]@pulumi\/azure-native['"]/.test(block.content)) score += 10;
  return score;
}

export function extractTapStack(markdown) {
  const exactPathMatch = markdown.match(/```[^\n]*path=["']lib\/tap-stack\.ts["'][^\n]*\n([\s\S]*?)```/i);
  if (exactPathMatch) {
    return normalizeTapStack(exactPathMatch[1]);
  }

  const codeBlocks = extractCodeBlocks(markdown);
  const candidates = codeBlocks
    .map((block) => ({ ...block, score: scoreTapStackBlock(block) }))
    .filter((block) => block.score >= 60)
    .sort((left, right) => right.score - left.score || right.content.length - left.content.length);

  if (candidates.length > 0) {
    return normalizeTapStack(candidates[0].content);
  }

  const raw = markdown.trim();
  if (looksLikeTapStack(raw)) {
    return normalizeTapStack(raw);
  }

  throw new Error("model response did not include a usable lib/tap-stack.ts code block");
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

function maxOutputTokensForScenario(scenario) {
  if (Number.isFinite(scenario?.maxOutputTokens) && scenario.maxOutputTokens > 0) {
    return Math.max(5000, Math.min(12000, Math.trunc(scenario.maxOutputTokens)));
  }
  const integrationCheckBudget = (scenario.integrationChecks?.length ?? 0) * 120;
  const outputKeyBudget = (scenario.expectedOutputKeys?.length ?? 0) * 25;
  return Math.min(12000, Math.max(5000, 5000 + integrationCheckBudget + outputKeyBudget));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAI(scenario, prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }
  const maxOutputTokens = maxOutputTokensForScenario(scenario);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const startedAt = Date.now();
    console.log(`calling ${model} with max_output_tokens=${maxOutputTokens}...`);
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
        max_output_tokens: maxOutputTokens,
        text: { verbosity: "low" },
      }),
    });
    const rawBody = await response.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { raw: rawBody };
    }
    if (response.ok) {
      console.log(`model response received in ${Math.round((Date.now() - startedAt) / 1000)}s`);
      return outputText(body);
    }
    const isRetriable = response.status === 429 || response.status >= 500;
    if (isRetriable && attempt < 3) {
      console.log(`OpenAI Responses API transient failure on attempt ${attempt}/3: HTTP ${response.status}. Retrying...`);
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`OpenAI Responses API failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  throw new Error('OpenAI Responses API retries exhausted');
}

function scenarioUsesPublicDns(scenario) {
  return (scenario.requiredSourceMarkers ?? []).some((marker) => {
    const normalizedMarker = String(marker ?? '').toLowerCase();
    return normalizedMarker.includes('dns.recordset') || normalizedMarker.includes('network.recordset');
  })
    || (scenario.integrationChecks ?? []).some((check) => String(check.typePath ?? '').startsWith('dnsZones/'));
}

function scenarioUsesPrivateDns(scenario) {
  return (scenario.requiredSourceMarkers ?? []).some((marker) => {
    const normalizedMarker = String(marker ?? '').toLowerCase();
    return normalizedMarker.includes('privatedns.privaterecordset') || normalizedMarker.includes('network.privaterecordset');
  })
    || (scenario.integrationChecks ?? []).some((check) => String(check.typePath ?? '').startsWith('privateDnsZones/'));
}

function scenarioUsesFrontDoorWafPolicyResource(scenario) {
  return (scenario.requiredSourceMarkers ?? []).some(
    (marker) => String(marker).toLowerCase() === 'frontdoor.policy',
  ) || (scenario.integrationChecks ?? []).some(
    (check) => check.expectedType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies',
  );
}

function scenarioUsesFrontDoor(scenario) {
  return (scenario.requiredSourceMarkers ?? []).some(
    (marker) => /cdn\.(AFDEndpoint|AFDOriginGroup|AFDOrigin|Route|SecurityPolicy)/i.test(String(marker))
      || String(marker).toLowerCase() === 'frontdoor.policy',
  ) || Object.keys(scenario.resourceNames ?? {}).some(
    (key) => key.toLowerCase().includes('frontdoor') || key.toLowerCase().includes('securitypolicy'),
  ) || (scenario.integrationChecks ?? []).some(
    (check) => String(check.expectedType ?? '').startsWith('Microsoft.Cdn/profiles/afdEndpoints')
      || String(check.expectedType ?? '').startsWith('Microsoft.Cdn/profiles/originGroups')
      || String(check.expectedType ?? '').startsWith('Microsoft.Cdn/profiles/securityPolicies'),
  );
}

function scenarioUsesApplicationGateway(scenario) {
  return (scenario.requiredSourceMarkers ?? []).some((marker) => String(marker).includes('network.ApplicationGateway'))
    || Object.keys(scenario.resourceNames ?? {}).some((key) => key.toLowerCase().includes('applicationgateway'))
    || (scenario.integrationChecks ?? []).some(
      (check) => check.expectedType === 'Microsoft.Network/applicationGateways',
    );
}

export function validateTapStack(scenario, tapStackText) {
  const usesAzureNativeV3 = scenarioUsesAzureNativeV3(scenario);
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
  const hasPublicDns = scenarioUsesPublicDns(scenario);
  const hasPrivateDns = scenarioUsesPrivateDns(scenario);
  const hasPublicRecordSet = usesAzureNativeV3
    ? /new\s+(?:azure\.)?dns\.RecordSet\(/.test(tapStackText)
    : /new\s+(?:azure\.)?network\.RecordSet\(/.test(tapStackText);
  const hasPrivateRecordSet = usesAzureNativeV3
    ? /new\s+(?:azure\.)?privatedns\.PrivateRecordSet\(/.test(tapStackText)
    : /new\s+(?:azure\.)?network\.PrivateRecordSet\(/.test(tapStackText);
  const usesWrongNetworkNamespaceForDns = usesAzureNativeV3
    && /\b(?:azure\.)?network\.(?:Zone|RecordSet|PrivateZone|VirtualNetworkLink|PrivateRecordSet)\b/.test(tapStackText);
  const usesWrongDnsModulesForLegacy = !usesAzureNativeV3
    && /\b(?:azure\.)?(?:dns\.(?:Zone|RecordSet)|privatedns\.(?:PrivateZone|VirtualNetworkLink|PrivateRecordSet))\b/.test(tapStackText);
  const usesUnsupportedAzureNativeModules = /from\s+["']@pulumi\/azure-native\/frontdoor["']/.test(tapStackText);
  const keyVaultPattern = /new\s+(?:azure\.)?keyvault\.Vault\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;
  const cosmosContainerPattern = /new\s+(?:azure\.)?documentdb\.SqlResourceSqlContainer\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;
  const storageChildPattern = /new\s+(?:azure\.)?storage\.(?:BlobContainer|FileShare|Queue|Table)\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;
  const privateDnsLinkPattern = /new\s+(?:azure\.)?(?:privatedns\.VirtualNetworkLink|network\.VirtualNetworkLink)\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;
  const privateDnsRecordPattern = /new\s+(?:azure\.)?(?:privatedns\.PrivateRecordSet|network\.PrivateRecordSet)\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;

  if (hasPrivateDns && !hasPrivateRecordSet) {
    throw new Error(usesAzureNativeV3
      ? 'private DNS scenarios must create azure.privatedns.PrivateRecordSet resources'
      : 'private DNS scenarios must create azure.network.PrivateRecordSet resources');
  }
  if (hasPublicDns && !hasPublicRecordSet) {
    throw new Error(usesAzureNativeV3
      ? 'public DNS scenarios must create azure.dns.RecordSet resources'
      : 'public DNS scenarios must create azure.network.RecordSet resources');
  }
  if (usesUnsupportedAzureNativeModules) {
    throw new Error('This repo\'s shipped Azure Native version does not expose @pulumi/azure-native/frontdoor; use azure.cdn.* plus azure.network.WebApplicationFirewallPolicy instead');
  }
  for (const block of tapStackText.match(keyVaultPattern) ?? []) {
    const topLevelTenantIdIndex = block.indexOf('tenantId:');
    const topLevelSkuIndex = block.indexOf('sku:');
    const propertiesIndex = block.indexOf('properties:');
    if (topLevelTenantIdIndex !== -1 && (propertiesIndex === -1 || topLevelTenantIdIndex < propertiesIndex)) {
      throw new Error('azure.keyvault.Vault must not set tenantId at the top level of VaultArgs; put tenantId only inside properties.tenantId');
    }
    if (topLevelSkuIndex !== -1 && (propertiesIndex === -1 || topLevelSkuIndex < propertiesIndex)) {
      throw new Error('azure.keyvault.Vault must not set sku at the top level of VaultArgs; put sku only inside properties.sku');
    }
    if (propertiesIndex !== -1 && !/\bproperties\s*:\s*{[\s\S]*?\bsku\s*:/.test(block)) {
      throw new Error('azure.keyvault.Vault must include properties.sku inside the Vault properties block');
    }
  }
  for (const block of tapStackText.match(cosmosContainerPattern) ?? []) {
    if (!/\bdependsOn\s*:/.test(block)) {
      throw new Error('azure.documentdb.SqlResourceSqlContainer must include an explicit dependsOn option that waits for its SQL database resource');
    }
  }
  for (const block of tapStackText.match(privateDnsLinkPattern) ?? []) {
    if (!/\bdependsOn\s*:/.test(block)) {
      throw new Error('azure private DNS virtual network links must include an explicit dependsOn option that waits for the private zone resource');
    }
  }
  for (const block of tapStackText.match(privateDnsRecordPattern) ?? []) {
    if (!/\bdependsOn\s*:/.test(block)) {
      throw new Error('azure private DNS record sets must include an explicit dependsOn option that waits for the private zone resource');
    }
  }
  for (const block of tapStackText.match(storageChildPattern) ?? []) {
    const accountNameMatch = block.match(/\baccountName\s*:\s*([^\n,]+)/);
    if (!accountNameMatch) continue;
    const accountNameExpr = accountNameMatch[1];
    const hasOutputDependency = /\.\s*name\b/.test(accountNameExpr) || /\.apply\s*\(/.test(accountNameExpr);
    if (!hasOutputDependency && !/\bdependsOn\s*:/.test(block)) {
      throw new Error('azure.storage child resources must use accountName from the created storage resource output or include an explicit dependsOn on the storage account');
    }
  }
  for (const match of tapStackText.matchAll(/listStorageAccountKeysOutput\(\s*{([\s\S]*?)}\s*\)/g)) {
    const block = match[1] ?? '';
    const accountNameMatch = block.match(/\baccountName\s*:\s*([^\n,]+)/);
    if (!accountNameMatch) continue;
    const accountNameExpr = accountNameMatch[1];
    if (!/\.\s*name\b/.test(accountNameExpr) && !/\.apply\s*\(/.test(accountNameExpr)) {
      throw new Error('azure.storage.listStorageAccountKeysOutput must use accountName from the created storage resource output');
    }
  }
  if (/\bWorkspaceResourceId\s*:/.test(tapStackText)) {
    throw new Error(usesAzureNativeV3
      ? 'For azure.applicationinsights.Component, use workspaceResourceId, not WorkspaceResourceId.'
      : 'For azure.insights.Component, use workspaceResourceId, not WorkspaceResourceId.');
  }
  if ((hasPublicDns || hasPrivateDns) && usesWrongNetworkNamespaceForDns) {
    throw new Error('DNS scenarios must not use network.Zone, network.RecordSet, network.PrivateZone, network.VirtualNetworkLink, or network.PrivateRecordSet; use azure.dns.* for public DNS and azure.privatedns.* for private DNS.');
  }
  if ((hasPublicDns || hasPrivateDns) && usesWrongDnsModulesForLegacy) {
    throw new Error('This bundle uses the Azure Native 2.x surface. Use azure.network.Zone and azure.network.RecordSet for public DNS, and use azure.network.PrivateZone, azure.network.VirtualNetworkLink, and azure.network.PrivateRecordSet for private DNS.');
  }
  if (hasPrivateDns && !hasPublicDns && hasPublicRecordSet) {
    throw new Error(usesAzureNativeV3
      ? 'private DNS-only scenarios must use azure.privatedns.PrivateRecordSet, not azure.dns.RecordSet'
      : 'private DNS-only scenarios must use azure.network.PrivateRecordSet, not azure.network.RecordSet');
  }
  if (scenarioUsesFrontDoor(scenario) && /new\s+(?:azure\.)?cdn\.Route\([\s\S]*?\borigins\s*:/.test(tapStackText)) {
    throw new Error('Azure Front Door RouteArgs must use originGroup, not origins, in this repo\'s shipped Azure Native version.');
  }
  if (scenarioUsesFrontDoorWafPolicyResource(scenario)) {
    if (/(?:azure\.)?(?:cdn\.(?:WebApplicationFirewallPolicy|FrontDoorWebApplicationFirewallPolicy|AfdWebApplicationFirewallPolicy)|network\.(?:FrontDoorWebApplicationFirewallPolicy|AfdWebApplicationFirewallPolicy))\b/.test(tapStackText)) {
      throw new Error('Front Door WAF scenarios must use azure.network.WebApplicationFirewallPolicy, not FrontDoorWebApplicationFirewallPolicy or azure.cdn.* WebApplicationFirewallPolicy resources, in this repo\'s shipped Azure Native version.');
    }
    const hasFrontDoorWaf = tapStackText.includes('network.WebApplicationFirewallPolicy')
      || tapStackText.includes('azure.network.WebApplicationFirewallPolicy');
    if (!hasFrontDoorWaf) {
      throw new Error('Front Door WAF scenarios must declare a Front Door WAF policy resource.');
    }
    for (const block of tapStackText.match(/new\s+(?:azure\.)?network\.WebApplicationFirewallPolicy\([\s\S]*?\n\s*}\s*(?:as\s+any)?\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g) ?? []) {
      if (/\bpolicySettings\s*:\s*{[\s\S]*?\benabledState\b/.test(block)) {
        throw new Error('Front Door WAF scenarios must use policySettings.state, not policySettings.enabledState, on azure.network.WebApplicationFirewallPolicy.');
      }
      if (/\bsku\s*:/.test(block)) {
        throw new Error('Front Door WAF scenarios must not set a top-level sku on azure.network.WebApplicationFirewallPolicy in this repo\'s shipped Azure Native version.');
      }
      if (/}\s*as\s+any\s*(?:,\s*\{[\s\S]*?\})?\s*\);/.test(block)) {
        throw new Error('Front Door WAF scenarios must not cast azure.network.WebApplicationFirewallPolicy payloads with "as any". Use the typed WebApplicationFirewallPolicyArgs shape.');
      }
    }
  }
  if (scenarioUsesApplicationGateway(scenario)
    && /\.subnets\.apply\s*\(/.test(tapStackText)) {
    throw new Error('application gateway scenarios must not derive subnet ids from virtualNetwork.subnets.apply(...); build deterministic subnet ARM ids from the fixed VNet and subnet names');
  }
  if (scenarioUsesApplicationGateway(scenario)
    && !/\bgatewayIPConfigurations\b/.test(tapStackText)) {
    throw new Error('application gateway scenarios must declare gatewayIPConfigurations with subnet references');
  }
  const publicRecordSetPattern = usesAzureNativeV3
    ? /new\s+(?:azure\.)?dns\.RecordSet\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g
    : /new\s+(?:azure\.)?network\.RecordSet\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;
  for (const block of tapStackText.match(publicRecordSetPattern) ?? []) {
    if (/\bprivateZoneName\b/.test(block)) {
      throw new Error('public DNS RecordSet resources must target the public zone with zoneName, not a privateZoneName');
    }
  }
  const privateRecordSetPattern = usesAzureNativeV3
    ? /new\s+(?:azure\.)?privatedns\.PrivateRecordSet\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g
    : /new\s+(?:azure\.)?network\.PrivateRecordSet\([\s\S]*?\n\s*}\s*(?:,\s*\{[\s\S]*?\})?\s*\);/g;
  for (const block of tapStackText.match(privateRecordSetPattern) ?? []) {
    if (/\bzoneName\b/.test(block)) {
      throw new Error(usesAzureNativeV3
        ? 'azure.privatedns.PrivateRecordSet must target the private zone with privateZoneName, not zoneName'
        : 'azure.network.PrivateRecordSet must target the private zone with privateZoneName, not zoneName');
    }
  }
  for (const marker of scenario.requiredSourceMarkers) {
    if (!sourceSatisfiesMarker(tapStackText, marker)) {
      throw new Error(`missing scenario marker ${marker}`);
    }
  }
  for (const forbidden of scenario.forbiddenSourceMarkers) {
    if (tapStackText.toLowerCase().includes(String(forbidden).toLowerCase())) {
      throw new Error(`contains forbidden marker ${forbidden}`);
    }
  }
}

function repairPrompt(scenario, originalPrompt, error, previousResponse) {
  const usesAzureNativeV3 = scenarioUsesAzureNativeV3(scenario);
  const extraGuidance = [];
  if (String(error).includes('missing scenario marker frontdoor.policy')) {
    extraGuidance.push('This task must declare an Azure Front Door WAF policy using azure.network.WebApplicationFirewallPolicy in the shipped Azure Native version for this repo.');
    extraGuidance.push('Do not import @pulumi/azure-native/frontdoor. Attach the WAF policy id through azure.cdn.SecurityPolicy.');
    extraGuidance.push('Keep the policy name fixed to the prompt and use managedRules, customRules, and policySettings only unless the generated SDK type proves additional fields are accepted.');
  }
  if (String(error).includes('must use azure.network.WebApplicationFirewallPolicy, not FrontDoorWebApplicationFirewallPolicy')) {
    extraGuidance.push('Delete the existing Front Door WAF declaration and rewrite it from scratch.');
    extraGuidance.push('Do not use azure.network.FrontDoorWebApplicationFirewallPolicy, azure.network.AfdWebApplicationFirewallPolicy, azure.cdn.WebApplicationFirewallPolicy, azure.cdn.FrontDoorWebApplicationFirewallPolicy, or azure.cdn.AfdWebApplicationFirewallPolicy. In this repo, Front Door WAF must be azure.network.WebApplicationFirewallPolicy.');
    extraGuidance.push('Rewrite it exactly as: new azure.network.WebApplicationFirewallPolicy(name, { policyName: name, resourceGroupName: rg.name, location: "global", policySettings: { state: "Enabled", mode: "Prevention" }, managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] } });');
  }
  if (String(error).includes('policySettings.state, not policySettings.enabledState')) {
    extraGuidance.push('Delete the existing Front Door WAF declaration and rewrite it from scratch.');
    extraGuidance.push('For azure.network.WebApplicationFirewallPolicy, set policySettings.state: "Enabled" or "Disabled". Do not use policySettings.enabledState.');
    extraGuidance.push('Use this exact WAF resource shape and only substitute the prompt-fixed name variables: new azure.network.WebApplicationFirewallPolicy(name, { policyName: name, resourceGroupName: rg.name, location: "global", policySettings: { state: "Enabled", mode: "Prevention" }, managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] } });');
  }
  if (String(error).includes('must not set a top-level sku on azure.network.WebApplicationFirewallPolicy')) {
    extraGuidance.push('Delete the existing Front Door WAF declaration and rewrite it from scratch.');
    extraGuidance.push('Remove the top-level sku from azure.network.WebApplicationFirewallPolicy. Keep location, policyName, policySettings, managedRules, and customRules only.');
    extraGuidance.push('Use this exact WAF resource shape and do not add any extra top-level fields: new azure.network.WebApplicationFirewallPolicy(name, { policyName: name, resourceGroupName: rg.name, location: "global", policySettings: { state: "Enabled", mode: "Prevention" }, managedRules: { managedRuleSets: [{ ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1" }] } });');
  }
  if (String(error).includes('must not cast azure.network.WebApplicationFirewallPolicy payloads with "as any"')) {
    extraGuidance.push('Do not cast azure.network.WebApplicationFirewallPolicy with "as any". Use the typed payload shape so invalid properties fail before deploy.');
  }
  if (String(error).includes('RouteArgs must use originGroup, not origins')) {
    extraGuidance.push('For azure.cdn.Route in this repo, use the originGroup property only. Do not set origins on the route payload.');
  }
  if (String(error).includes('use workspaceResourceId, not WorkspaceResourceId')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For azure.applicationinsights.Component, use workspaceResourceId in lower camel case. Do not use WorkspaceResourceId.'
      : 'For azure.insights.Component, use workspaceResourceId in lower camel case. Do not use WorkspaceResourceId.');
  }
  if (String(error).includes('missing scenario marker applicationinsights.')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'This task must declare an Application Insights component using azure.applicationinsights.Component.'
      : 'This task must declare an Application Insights component using azure.insights.Component.');
  }
  if (String(error).includes('missing scenario marker devices.')) {
    extraGuidance.push('This task must declare Azure IoT Hub resources. In Front Door / v3-style tasks, import iothub from @pulumi/azure-native/iothub and use iothub.IotHubResource. In top-level v2 tasks, azure.devices.IotHubResource is valid.');
  }
  if (String(error).includes('SqlResourceSqlContainer must include an explicit dependsOn option')) {
    extraGuidance.push('Every azure.documentdb.SqlResourceSqlContainer must be created with a third-argument resource options object that includes dependsOn: [sqlDatabase].');
    extraGuidance.push('Keep the prompt-fixed accountName, databaseName, and containerName, and wire the container after the Azure Cosmos SQL database resource variable.');
  }
  if (String(error).includes('azure private DNS virtual network links must include an explicit dependsOn option')) {
    extraGuidance.push('Every azure private DNS VirtualNetworkLink must include a third-argument resource options object with dependsOn: [privateZone, virtualNetwork] or at least dependsOn: [privateZone].');
    extraGuidance.push('Do not rely on raw privateZoneName strings to order private DNS links.');
  }
  if (String(error).includes('azure private DNS record sets must include an explicit dependsOn option')) {
    extraGuidance.push('Every azure private DNS PrivateRecordSet must include a third-argument resource options object with dependsOn: [privateZone].');
    extraGuidance.push('Do not rely on raw privateZoneName strings to order private DNS record sets.');
  }
  if (String(error).includes('azure.storage child resources must use accountName from the created storage resource output')) {
    extraGuidance.push('For azure.storage.BlobContainer, FileShare, Queue, and Table, use accountName: storage.name instead of the raw prompt-fixed storage account string.');
    extraGuidance.push('If you cannot use storage.name directly, then add an explicit dependsOn: [storage] resource option to each storage child resource.');
  }
  if (String(error).includes('azure.storage.listStorageAccountKeysOutput must use accountName from the created storage resource output')) {
    extraGuidance.push('Call azure.storage.listStorageAccountKeysOutput with accountName: storage.name so the invoke waits for the storage account resource.');
    extraGuidance.push('Do not use accountName: "prompt-fixed-storage-name" or accountName: storageAccountName in the invoke payload.');
  }
  if (String(error).includes('must not set tenantId at the top level of VaultArgs')) {
    extraGuidance.push('For azure.keyvault.Vault, remove any top-level tenantId field from VaultArgs.');
    extraGuidance.push('Keep tenantId only inside properties: { tenantId: client.tenantId, ... }. The top level should contain vaultName, resourceGroupName, location, and properties only.');
  }
  if (String(error).includes('must not set sku at the top level of VaultArgs')) {
    extraGuidance.push('For azure.keyvault.Vault, remove any top-level sku field from VaultArgs.');
    extraGuidance.push('Keep sku only inside properties: { tenantId: client.tenantId, sku: { family: "A", name: "standard" }, ... }.');
  }
  if (String(error).includes('must include properties.sku inside the Vault properties block')) {
    extraGuidance.push('For azure.keyvault.Vault, include sku only inside the properties block.');
    extraGuidance.push('Use this shape: properties: { tenantId: client.tenantId, sku: { family: "A", name: "standard" }, accessPolicies: [], ... }.');
  }
  return [
    originalPrompt,
    "",
    "The previous draft did not meet the task contract.",
    `Repair these exact issues: ${error}`,
    ...(extraGuidance.length > 0 ? ["", ...extraGuidance] : []),
    "Return a complete replacement for lib/tap-stack.ts only.",
    "Do not include any prose, bullets, or explanations.",
    "Your response must contain exactly one fenced TypeScript code block with this header:",
    "```ts path=\"lib/tap-stack.ts\"",
    "Put the full file contents inside that fence and nothing else.",
    "",
    "Previous draft:",
    previousResponse,
  ].join("\n");
}

function runtimeRepairPrompt(scenario, originalPrompt, runFailure, previousTapStack) {
  const usesAzureNativeV3 = scenarioUsesAzureNativeV3(scenario);
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
  if (String(runFailure).includes("Cannot find module '@pulumi/azure-native/frontdoor'")) {
    extraGuidance.push('Do not import @pulumi/azure-native/frontdoor. In this repo, declare Front Door WAF with azure.network.WebApplicationFirewallPolicy and keep Front Door profile, endpoints, routes, and security policy on azure.cdn.');
  }
  if (String(runFailure).includes("Cannot find module '@pulumi/azure-native/applicationinsights'")) {
    extraGuidance.push(usesAzureNativeV3
      ? 'Import Application Insights from the top-level azure namespace and use azure.applicationinsights.Component in this repo.'
      : 'Do not import @pulumi/azure-native/applicationinsights in this bundle. Use azure.insights.Component from the top-level azure namespace.');
  }
  if (String(runFailure).includes("tenantId' does not exist in type 'VaultArgs")) {
    extraGuidance.push('Your Key Vault declaration is wrong. Remove any top-level tenantId field from new azure.keyvault.Vault(...).');
    extraGuidance.push('Put tenantId only inside properties.tenantId, for example: new azure.keyvault.Vault(name, { resourceGroupName: rg.name, vaultName: name, location, properties: { tenantId: client.tenantId, sku: { family: "A", name: "standard" }, accessPolicies: [] } });');
  }
  if (String(runFailure).includes("sku' does not exist in type 'VaultArgs")) {
    extraGuidance.push('Your Key Vault declaration is wrong. Remove any top-level sku field from new azure.keyvault.Vault(...).');
    extraGuidance.push('Put sku only inside properties.sku, for example: new azure.keyvault.Vault(name, { resourceGroupName: rg.name, vaultName: name, location, properties: { tenantId: client.tenantId, sku: { family: "A", name: "standard" }, accessPolicies: [], enableRbacAuthorization: true } });');
  }
  if (String(runFailure).includes("Property 'sku' is missing") && String(runFailure).includes('VaultPropertiesArgs')) {
    extraGuidance.push('Your Key Vault properties block is incomplete. Add properties.sku inside the properties object and omit top-level sku from VaultArgs.');
    extraGuidance.push('Use this pattern: new azure.keyvault.Vault(name, { resourceGroupName: rg.name, vaultName: name, location, properties: { tenantId: client.tenantId, sku: { family: "A", name: "standard" }, accessPolicies: [], enableRbacAuthorization: true } });');
  }
  if (String(runFailure).includes('SubnetIsRequired')
    && String(runFailure).includes('Application gateway subnet is required')) {
    extraGuidance.push('Your Application Gateway payload did not provide a valid subnet id in gatewayIPConfigurations.');
    extraGuidance.push('Do not read gateway subnet ids from virtualNetwork.subnets.apply(...). Build deterministic subnet ARM ids from subscription id, resource group name, virtual network name, and the prompt-fixed application gateway subnet name, then pass that id into gatewayIPConfigurations[0].subnet.id.');
    extraGuidance.push('Keep the application gateway subnet as a real subnet in the VNet, but do not depend on inline subnets exposing child ids back through Pulumi outputs.');
  }
  if ((String(runFailure).includes('used before its declaration') || String(runFailure).includes('referenced directly or indirectly in its own initializer'))
    && (String(runFailure).includes('eastAgw') || String(runFailure).includes('westAgw'))) {
    extraGuidance.push('Do not reference eastAgw or westAgw inside their own constructors. Build listener, frontend port, backend pool, and backend settings IDs from fixed gateway names and resource IDs instead.');
  }
  if (String(runFailure).includes('origins')
    && String(runFailure).includes('RouteArgs')) {
    extraGuidance.push('For azure.cdn.Route, remove origins and use originGroup instead.');
  }
  if (String(runFailure).includes('Microsoft.Cdn/profiles/afdEndpoints')
    && String(runFailure).includes('ParentResourceNotFound')) {
    extraGuidance.push('Azure Front Door child resources do not infer dependencies from profileName strings. Make every cdn.AFDEndpoint and cdn.AFDOriginGroup depend explicitly on the cdn.Profile.');
    extraGuidance.push('Make each cdn.AFDOrigin depend on the cdn.AFDOriginGroup, make the cdn.Route depend on the AFDEndpoint plus its AFDOrigins, and make the cdn.SecurityPolicy depend on the endpoint or route plus the Front Door WAF policy.');
  }
  if (String(runFailure).includes('Microsoft.Cdn/profiles/originGroups')
    && String(runFailure).includes('ParentResourceNotFound')) {
    extraGuidance.push('Your Azure Front Door origin group raced the parent profile. Add dependsOn: [profile] to each cdn.AFDOriginGroup and then depend child origins on that origin group.');
  }
  if (String(runFailure).includes('CdnWebApplicationFirewallPolicy')
    || String(runFailure).includes('FrontDoorWebApplicationFirewallPolicy')
    || String(runFailure).includes('AfdWebApplicationFirewallPolicy')
    || (String(runFailure).includes("Property 'WebApplicationFirewallPolicy' does not exist") && String(runFailure).includes('/cdn/index'))) {
    extraGuidance.push('Use azure.network.WebApplicationFirewallPolicy for Azure Front Door WAF in this repo, then attach it with azure.cdn.SecurityPolicy.');
    extraGuidance.push('Do not use nonexistent Front Door WAF classes from azure.cdn or @pulumi/azure-native/frontdoor in this runner image.');
  }
  if (String(runFailure).includes('privateZoneName')
    && String(runFailure).includes('RecordSetArgs')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For private DNS records, use azure.privatedns.PrivateRecordSet instead of azure.dns.RecordSet.'
      : 'For private DNS records, use azure.network.PrivateRecordSet instead of azure.network.RecordSet.');
  }
  if (String(runFailure).includes('ParentResourceNotFound')
    && (String(runFailure).includes('Microsoft.Network/privateDnsZones/A')
      || String(runFailure).includes('Microsoft.Network/privateDnsZones/virtualNetworkLinks'))) {
    extraGuidance.push(usesAzureNativeV3
      ? 'Your private DNS child resources raced the private zone. Keep the zone in a variable like privateZone and add explicit resource options: { dependsOn: [privateZone] } to every azure.privatedns.PrivateRecordSet and { dependsOn: [privateZone, vnet] } to every azure.privatedns.VirtualNetworkLink.'
      : 'Your private DNS child resources raced the private zone. Keep the zone in a variable like privateZone and add explicit resource options: { dependsOn: [privateZone] } to every azure.network.PrivateRecordSet and { dependsOn: [privateZone, vnet] } to every azure.network.VirtualNetworkLink.');
    extraGuidance.push('Do not rely on the raw prompt-fixed privateZoneName string to establish ordering.');
  }
  if (!usesAzureNativeV3
    && (String(runFailure).includes("Property 'dns' does not exist")
      || String(runFailure).includes("Property 'privatedns' does not exist"))) {
    extraGuidance.push('This bundle uses the Azure Native 2.x surface. Do not use azure.dns.* or azure.privatedns.* here.');
    extraGuidance.push('Use azure.network.Zone and azure.network.RecordSet for public DNS, and use azure.network.PrivateZone, azure.network.VirtualNetworkLink, and azure.network.PrivateRecordSet for private DNS.');
  }
  if (String(runFailure).includes("Property 'Zone' does not exist")
    || String(runFailure).includes("Property 'PrivateZone' does not exist")
    || String(runFailure).includes("Property 'RecordSet' does not exist")
    || String(runFailure).includes("Property 'PrivateRecordSet' does not exist")
    || String(runFailure).includes("Property 'VirtualNetworkLink' does not exist")) {
    if (usesAzureNativeV3) {
      extraGuidance.push('Do not import @pulumi/azure-native/network and then call network.Zone, network.RecordSet, network.PrivateZone, network.VirtualNetworkLink, or network.PrivateRecordSet.');
      extraGuidance.push('For DNS resources in this repo, prefer import * as azure from "@pulumi/azure-native" and then create azure.dns.Zone, azure.dns.RecordSet, azure.privatedns.PrivateZone, azure.privatedns.VirtualNetworkLink, and azure.privatedns.PrivateRecordSet.');
    } else {
      extraGuidance.push('This bundle uses the Azure Native 2.x surface. Use azure.network.Zone and azure.network.RecordSet for public DNS, and use azure.network.PrivateZone, azure.network.VirtualNetworkLink, and azure.network.PrivateRecordSet for private DNS.');
    }
  }
  if (String(runFailure).includes('ParentResourceNotFound')
    && String(runFailure).includes('Microsoft.Network/dnsZones/A')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'You used public DNS record-set semantics against a private DNS zone. Replace azure.dns.RecordSet with azure.privatedns.PrivateRecordSet and use privateZoneName instead of zoneName.'
      : 'You used public DNS record-set semantics against a private DNS zone. Replace azure.network.RecordSet with azure.network.PrivateRecordSet and use privateZoneName instead of zoneName.');
  }
  if (String(runFailure).includes('RecordSetArgs')
    && String(runFailure).includes('zoneName')
    && String(runFailure).includes('relativeRecordSetName')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For Azure public DNS, keep azure.dns.RecordSet on the public zone, use zoneName for the zone, and use relativeRecordSetName values like east or api rather than full FQDNs.'
      : 'For Azure public DNS, keep azure.network.RecordSet on the public zone, use zoneName for the zone, and use relativeRecordSetName values like east or api rather than full FQDNs.');
  }
  if (scenarioUsesPublicDns(scenario)
    && scenarioUsesPrivateDns(scenario)) {
    extraGuidance.push(usesAzureNativeV3
      ? 'This scenario mixes public and private DNS. Keep azure.dns.RecordSet only on the public DNS zone and keep azure.privatedns.PrivateRecordSet only on the private DNS zone.'
      : 'This scenario mixes public and private DNS. Keep azure.network.RecordSet only on the public DNS zone and keep azure.network.PrivateRecordSet only on the private DNS zone.');
  }
  if (String(runFailure).includes('PublicIPAddress')
    && String(runFailure).includes('sku')) {
    extraGuidance.push('For azure.network.PublicIPAddress, use Standard sku and a static allocation method unless the prompt explicitly requires a different shape.');
  }
  if (String(runFailure).includes('Property \'Service\' does not exist on type')
    && String(runFailure).includes('apimanagement')) {
    extraGuidance.push('Use azure.apimanagement.ApiManagementService instead of any nonexistent Service class.');
  }
  if (String(runFailure).includes('ApiOperationPolicy')
    || (String(runFailure).includes('operationId')
      && String(runFailure).includes('apimanagement'))) {
    extraGuidance.push('For API Management operations, use azure.apimanagement.ApiOperation with the prompt-fixed operationId and azure.apimanagement.ApiOperationPolicy with policyId set to policy.');
  }
  if (String(runFailure).includes('ResourceNotFound')
    && String(runFailure).includes('products/')
    && String(runFailure).includes('/apis/')) {
    extraGuidance.push('Ensure the API is created before ProductApi and API operations run. Add explicit dependsOn edges so azure.apimanagement.ProductApi depends on both the Api and the Product, and azure.apimanagement.ApiOperation depends on the Api.');
  }
  if (String(runFailure).includes('Property \'FlexibleServer\' does not exist')
    && String(runFailure).includes('dbformysql')) {
    extraGuidance.push('Use azure.dbformysql.Server and azure.dbformysql.Database for MySQL flexible server resources.');
  }
  if (String(runFailure).includes('Property \'FlexibleServer\' does not exist')
    && String(runFailure).includes('dbforpostgresql')) {
    extraGuidance.push('Use azure.dbforpostgresql.Server and azure.dbforpostgresql.Database for PostgreSQL flexible server resources.');
  }
  if (String(runFailure).includes('sku')
    && String(runFailure).includes('TopicArgs')) {
    extraGuidance.push('Remove the top-level sku property from azure.eventgrid.Topic unless the exact generated TopicArgs type proves it is accepted.');
  }
  if (String(runFailure).includes('published')
    && String(runFailure).includes('ProductArgs')) {
    extraGuidance.push('Remove published from azure.apimanagement.Product. Use displayName and state instead of nonexistent ProductArgs fields.');
  }
  if (String(runFailure).includes('sku')
    && String(runFailure).includes('WebApplicationFirewallPolicyArgs')) {
    extraGuidance.push('Remove the top-level sku property from azure.network.WebApplicationFirewallPolicy. Keep policySettings, customRules, and managedRules only.');
  }
  if (String(runFailure).includes('Application Gateway WAF policySettings.state must be')) {
    extraGuidance.push('For azure.network.WebApplicationFirewallPolicy, set policySettings.state to "Enabled" or "Disabled". Do not use policySettings.enabledState.');
    extraGuidance.push('Do not cast the WebApplicationFirewallPolicy payload with "as any", because that can hide the wrong policySettings shape until deploy time.');
  }
  if (usesAzureNativeV3
    && String(runFailure).includes("Property 'insights' does not exist")) {
    extraGuidance.push('Do not use azure.insights.* in this repo. Use azure.monitor.ActionGroup, azure.monitor.MetricAlert, and azure.monitor.ActivityLogAlert for Azure Monitor, and use azure.applicationinsights.Component for Application Insights.');
  }
  if (!usesAzureNativeV3
    && (String(runFailure).includes("Property 'applicationinsights' does not exist")
      || String(runFailure).includes("Property 'monitor' does not exist")
      || (String(runFailure).includes("Property 'ActionGroup' does not exist") && String(runFailure).includes('/monitor/index'))
      || (String(runFailure).includes("Property 'MetricAlert' does not exist") && String(runFailure).includes('/monitor/index'))
      || (String(runFailure).includes("Property 'ActivityLogAlert' does not exist") && String(runFailure).includes('/monitor/index')))) {
    extraGuidance.push('This bundle uses the Azure Native 2.x surface. Use azure.insights.Component for Application Insights, and use azure.insights.ActionGroup, azure.insights.MetricAlert, and azure.insights.ActivityLogAlert for alerting.');
  }
  if (usesAzureNativeV3
    && String(runFailure).includes("Property 'cache' does not exist")) {
    extraGuidance.push('Do not use azure.cache.Redis in this repo. Use azure.redis.Redis.');
  }
  if (!usesAzureNativeV3
    && String(runFailure).includes("Property 'redis' does not exist")) {
    extraGuidance.push('This bundle uses the Azure Native 2.x surface. Use azure.cache.Redis here.');
  }
  if (String(runFailure).includes("Property 'location' must be 'global'")) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For azure.monitor.ActivityLogAlert, set location to "global".'
      : 'For azure.insights.ActivityLogAlert, set location to "global".');
  }
  if (String(runFailure).includes("DNS zones must use location 'global'")) {
    extraGuidance.push('For Azure public DNS zones, set location to "global".');
  }
  if (String(runFailure).includes('Application_Type')
    && String(runFailure).includes('ComponentArgs')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For azure.applicationinsights.Component, replace Application_Type with applicationType.'
      : 'For azure.insights.Component, replace Application_Type with applicationType.');
  }
  if ((String(runFailure).includes('kind')
      && String(runFailure).includes('ComponentArgs'))
    || (String(runFailure).includes("Property 'kind' is missing")
      && String(runFailure).includes('Component'))) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For azure.applicationinsights.Component, set both kind: "web" and applicationType: "web" unless the prompt explicitly requires a different exact shape.'
      : 'For azure.insights.Component, set both kind: "web" and applicationType: "web" unless the prompt explicitly requires a different exact shape.');
  }
  if ((String(runFailure).includes('TS2322')
      || String(runFailure).includes('is not assignable to type'))
    && String(runFailure).includes('Output<string | undefined>')) {
    extraGuidance.push('Do not pass Output<string | undefined> directly into string-only Azure Native args or output exports. Normalize it with .apply(value => value ?? "") or pulumi.interpolate before use.');
  }
  if (String(runFailure).includes('odata.type')
    && String(runFailure).includes('MetricAlert')) {
    extraGuidance.push(usesAzureNativeV3
      ? 'For azure.monitor.MetricAlert criteria, remove raw ARM fields like "odata.type" and use the typed Azure Native criteria shape only.'
      : 'For azure.insights.MetricAlert criteria, remove raw ARM fields like "odata.type" and use the typed Azure Native criteria shape only.');
  }
  if (String(runFailure).includes('invalid URL output')) {
    extraGuidance.push('For output keys ending in Url or Endpoint, emit exactly one https:// scheme. If the Azure Native property already includes https://, export it directly without prepending another scheme.');
  }
  if (String(runFailure).includes('invalid host output')) {
    extraGuidance.push('For output keys ending in HostName, export the bare hostname without an http:// or https:// prefix.');
  }
  if (String(runFailure).includes('Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers')
    && String(runFailure).includes('ResourceNotFound')) {
    extraGuidance.push('Your Cosmos SQL container raced its parent database. Declare the SQL database resource first, keep a variable for it, and then create the container with a third-argument options object: { dependsOn: [sqlDatabase] }.');
    extraGuidance.push('Do not rely on accountName/databaseName strings to order Cosmos SQL resources. The container must depend explicitly on the SqlResourceSqlDatabase resource instance.');
  }
  if ((String(runFailure).includes('Microsoft.Storage/storageAccounts/blobServices/containers')
      || String(runFailure).includes('Microsoft.Storage/storageAccounts/fileServices/shares'))
    && String(runFailure).includes('ParentResourceNotFound')) {
    extraGuidance.push('Your storage child resources raced the storage account. For every BlobContainer or FileShare, use accountName: storage.name so Pulumi tracks the dependency, or add a third-argument options object with dependsOn: [storage].');
    extraGuidance.push('Do not pass the raw prompt-fixed storage account string into storage child resources when the storage account is created in the same stack.');
  }
  if (String(runFailure).includes('azure-native:storage:listStorageAccountKeys')
    && String(runFailure).includes('ResourceNotFound')) {
    extraGuidance.push('Your storage keys invoke raced the storage account. Call azure.storage.listStorageAccountKeysOutput with accountName: storage.name, not the raw storage account string.');
  }
  if (String(runFailure).includes('publicNetworkAccess')
    && String(runFailure).includes('ServerArgs')
    && String(runFailure).includes('dbformysql')) {
    extraGuidance.push('Remove publicNetworkAccess from azure.dbformysql.Server. Keep the server args to resourceGroupName, serverName, location, administratorLogin, administratorLoginPassword, version, sku, storage, and backup unless the exact generated SDK type proves additional fields are accepted.');
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
  if (String(runFailure).includes('Current Limit (Total VMs)')
    && String(runFailure).includes('Microsoft.Web/serverfarms')) {
    extraGuidance.push('For the Function App plan, use a consumption App Service plan shape: sku.name Y1, sku.tier Dynamic, and include a functionapp-compatible plan body. If you set kind, use functionapp. If you set reserved, use a boolean.');
  }
  if (String(runFailure).includes('Missing required configuration variable')) {
    extraGuidance.push('Remove Pulumi config usage. Do not use new pulumi.Config(), require(), requireSecret(), or stack config for this task.');
    extraGuidance.push('Replace missing config variables with deterministic, strong, prompt-scoped constants in lib/tap-stack.ts so the bundle is self-contained.');
  }
  if (String(runFailure).includes("Parameter 'Charset' must be specified")
    && String(runFailure).includes('dbforpostgresql')) {
    extraGuidance.push('For azure.dbforpostgresql.Database, set charset and collation explicitly.');
  }
  if (String(runFailure).includes("Parameter 'Collation' must be specified")
    && String(runFailure).includes('dbforpostgresql')) {
    extraGuidance.push('For azure.dbforpostgresql.Database, set charset and collation explicitly.');
  }
  if (String(runFailure).includes("Parameter 'Charset' must be specified")
    && String(runFailure).includes('dbformysql')) {
    extraGuidance.push('For azure.dbformysql.Database, set charset and collation explicitly.');
  }
  if (String(runFailure).includes("Parameter 'Collation' must be specified")
    && String(runFailure).includes('dbformysql')) {
    extraGuidance.push('For azure.dbformysql.Database, set charset and collation explicitly.');
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
    const responsePath = path.join(distPath(root, "complex-pulumi-bundles"), "raw-responses", scenario.prId, `generation-attempt-${attempt}.md`);
    await mkdir(path.dirname(responsePath), { recursive: true });
    await writeFile(responsePath, response);
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
    writeFile(path.join(bundleDir, "package.json"), packageJson(scenario)),
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
  const integrationStdoutPath = path.join(reportsDir, "integration-tests-task-stdout.log");
  const integrationStderrPath = path.join(reportsDir, "integration-tests-task-stderr.log");
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
  const integrationStdout = await readFile(integrationStdoutPath, "utf8").catch(() => "");
  const integrationStderr = await readFile(integrationStderrPath, "utf8").catch(() => "");
  return {
    exitCode: result.code,
    report,
    failingStage,
    failingMessage,
    nativeStdout,
    nativeStderr,
    integrationStdout,
    integrationStderr,
    executionLogPath: path.join(shipmentDir, "execution.log"),
    executionReportPath: reportPath,
  };
}

function shouldRepairRun(runResult) {
  const evidence = `${runResult.failingMessage ?? ""}\n${runResult.nativeStdout ?? ""}\n${runResult.nativeStderr ?? ""}\n${runResult.integrationStdout ?? ""}\n${runResult.integrationStderr ?? ""}`;
  return /(Unable to compile TypeScript|TSError|error TS\d+|Cannot find module|Property '.+' does not exist on type|No overload matches this call|is not assignable to type|Missing required configuration variable|Property 'location' must be 'global'|DNS zones must use location 'global'|Parameter 'Charset' must be specified|Parameter 'Collation' must be specified|invalid URL output|invalid host output|Current Limit \(Total VMs\)|Microsoft\.DocumentDB\/databaseAccounts\/sqlDatabases\/containers[\s\S]*ResourceNotFound|products\/.+\/apis\/.+ResourceNotFound|azure-native:apimanagement:ProductApi[\s\S]*ResourceNotFound)/i.test(evidence);
}

function repairEvidence(runResult) {
  const evidence = `${runResult.failingMessage ?? ""}\n${runResult.nativeStdout ?? ""}\n${runResult.nativeStderr ?? ""}\n${runResult.integrationStdout ?? ""}\n${runResult.integrationStderr ?? ""}`.trim();
  if (evidence.length <= 4000) {
    return evidence;
  }
  return evidence.slice(-4000);
}

export async function main() {
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
