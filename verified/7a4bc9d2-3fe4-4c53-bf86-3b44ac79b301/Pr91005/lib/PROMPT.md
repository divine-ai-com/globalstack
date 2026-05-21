I need this written in Pulumi Azure TypeScript.

We have a partner-intake workflow that has grown past a simple function and a storage account. External partners submit compliance packages over HTTPS. That public entry point needs to sit behind Azure API Management. The backend needs to be an Azure Function App. When a request is valid, the system should persist the raw request, record ledger state, enqueue downstream work, publish a business event, and trigger an audit workflow. Secrets need to come from Azure Key Vault, and the operational telemetry needs to land in Azure Monitor through Log Analytics and Application Insights.

Please build this in `eastus`.

Here is the end-to-end flow I need:
- external callers send `POST /partner-intake` to Azure API Management
- API Management forwards that operation to the Function App backend
- the Function validates the request body and rejects malformed payloads
- on a valid request, the Function writes the raw request body to Blob Storage
- on a valid request, the Function inserts one ledger row into Azure Table Storage
- on a valid request, the Function sends one command message to an Azure Service Bus queue
- on a valid request, the Function publishes one custom event to an Azure Event Grid topic
- the Event Grid topic delivers that event to a Logic App workflow through an Event Grid subscription
- the Logic App parses the event and calls a second audit endpoint on the same Function App
- the audit endpoint writes one audit blob into a second container

The runtime behavior matters just as much as the resource creation.

For request handling:
- a valid request sent through API Management must return HTTP `202` with a JSON body containing `partnerId`, `batchId`, `status`, and `rawBlobPath`
- a direct request to the Function intake endpoint without the required shared header must return HTTP `401`
- a request missing `partnerId`, `batchId`, `submittedAt`, or a non-empty `documents` array must return HTTP `400` and must not create Blob, Table, Service Bus, or Event Grid side effects

For side effects after a valid request:
- create one raw blob at `raw/{partnerId}/{batchId}.json`
- create one table entity in the intake ledger table with `PartitionKey = partnerId` and `RowKey = batchId`
- create one Service Bus queue message whose body includes `partnerId`, `batchId`, `submittedAt`, and `documentCount`
- create one Event Grid event with subject `/partners/{partnerId}/batches/{batchId}` and event type `Partner.Intake.Accepted`
- create one audit blob at `audit/{partnerId}/{batchId}.json` after the Logic App workflow runs

Use this exact sample request body for the intake route:
```json
{
  "partnerId": "contoso-industrial",
  "batchId": "batch-2026-05-21-001",
  "submittedAt": "2026-05-21T12:00:00Z",
  "documents": [
    {
      "name": "packing-list.pdf",
      "uri": "https://partners.example.com/docs/packing-list.pdf",
      "sha256": "1111111111111111111111111111111111111111111111111111111111111111"
    }
  ]
}
```

Use these exact resource names:
- Resource group: `rg-az-intake-pulumi-azint0521`
- Storage account: `azintakepulazint0521`
- Raw blob container: `partner-intake`
- Audit blob container: `partner-audit`
- Queue Storage queue: `intake-jobs`
- Table Storage table: `intakeledger`
- Service Bus namespace: `sb-intake-pulumi-azint0521`
- Service Bus queue: `partner-intake-commands`
- Event Grid topic: `eg-intake-pulumi-azint0521`
- Function App plan: `plan-intake-pulumi-azint0521`
- Function App: `func-intake-pulumi-azint0521`
- API Management service: `apim-intake-pulumi-azint0521`
- API Management API: `partner-intake-api`
- API Management product: `partner-intake-product`
- Logic App workflow: `la-intake-audit-azint0521`
- Key Vault: `kv-intake-pul-azint0521`
- Key Vault secret: `partner-intake-shared-key`
- Log Analytics workspace: `log-intake-pulumi-azint0521`
- Application Insights component: `appi-intake-pulumi-azint0521`

Keep the Azure resource contract exactly as follows:
- use the package root imports from `@pulumi/azure-native` only; do not import nonexistent versioned namespace paths
- create one StorageV2 storage account with sku `Standard_LRS`, `allowBlobPublicAccess = false`, `minimumTlsVersion = TLS1_2`, and `enableHttpsTrafficOnly = true`
- create the raw and audit blob containers directly as `storage.BlobContainer` resources with `publicAccess = storage.PublicAccess.None`
- create the queue and table directly as `storage.Queue` and `storage.Table` resources; do not introduce helper resources such as `blobServices/default`, `queueServices/default`, or `tableServices/default` in this platform
- create one Service Bus namespace with sku `Standard`, and one queue named `partner-intake-commands` with `maxDeliveryCount = 10`
- create one custom Event Grid topic with `inputSchema = EventGridSchema`
- create one App Service plan for the Function App and one Function App that runs Node.js code from a deployable package staged by Pulumi
- put the Function code in the task itself; do not leave the backend as a placeholder or assume code is deployed separately
- the Function App must expose two HTTP routes:
  - `POST /api/intake`
  - `POST /api/audit`
- the `POST /api/intake` route must require header `x-partner-shared-key`; that expected value must come from an app setting backed by an Azure Key Vault reference, not a hardcoded literal
- use Key Vault to store the shared key secret, assign managed identity-based read access, and configure the Function App to resolve the Key Vault reference at runtime
- configure API Management so the published `POST /partner-intake` operation forwards to the Function intake route and injects the shared header by using a named value backed by the same Key Vault secret
- create one Logic App workflow using `Microsoft.Logic/workflows` that receives Event Grid deliveries and calls the Function audit route with the event payload
- create one Event Grid event subscription from the topic to the Logic App callback endpoint
- create one API Management API with one `POST /partner-intake` operation and one product association for that API
- create one Log Analytics workspace and one Application Insights component
- route diagnostic telemetry from API Management, the Function App, the Logic App, and the Event Grid topic into Log Analytics where the resource type supports diagnostic settings
- wire the Function App to Application Insights by app settings or connection string output from the deployed Application Insights resource
- do not add out-of-scope services such as Cosmos DB, PostgreSQL, AKS, Container Apps, Front Door, private endpoints, or custom domains
- do not use random suffix generators; use the exact names provided

Inside the Function code, I need this exact behavior.

For `POST /api/intake`:
- parse JSON
- validate `partnerId`, `batchId`, `submittedAt`, and a non-empty `documents` array
- reject invalid payloads with HTTP `400`
- reject requests without the correct `x-partner-shared-key` header with HTTP `401`
- write the raw body to Blob Storage path `raw/{partnerId}/{batchId}.json`
- insert or replace a table entity with:
  - `PartitionKey = partnerId`
  - `RowKey = batchId`
  - `status = Queued`
  - `documentCount = documents.length`
  - `submittedAt = submittedAt`
- send one Service Bus queue message with a JSON body carrying `partnerId`, `batchId`, `submittedAt`, and `documentCount`
- publish one Event Grid event carrying the same identifiers and the raw blob path
- return HTTP `202` with JSON `{ "partnerId": "...", "batchId": "...", "status": "Queued", "rawBlobPath": "raw/.../...json" }`

For `POST /api/audit`:
- accept the event payload produced by the Logic App
- validate that the payload contains `partnerId` and `batchId`
- write one audit blob at `audit/{partnerId}/{batchId}.json`
- return HTTP `202`

Use these Pulumi conventions:
- set `Pulumi.yaml` main to `bin/tap.ts`
- put the entry point in `bin/tap.ts`
- put the reusable stack construction in `lib/tap-stack.ts`
- name the stack factory function `createTapStack` and import that exact symbol from `bin/tap.ts`
- use this dependency set in `package.json`:
  - `@pulumi/azure-native`: `^2.80.0`
  - `@pulumi/pulumi`: `^3.122.0`
  - `@azure/data-tables`: `^13.3.0`
  - `@azure/storage-blob`: `^12.26.0`
  - `@azure/service-bus`: `^7.9.5`
  - `@azure/eventgrid`: `^5.12.0`
  - `@types/node`: `^20.0.0`
  - `ts-node`: `^10.9.2`
  - `typescript`: `^5.0.0`
- keep resource construction deterministic; no random names, no placeholders, no TODO comments, and no "implement later" handlers

Return exactly these files as Markdown fenced code blocks with a path attribute:
- `Pulumi.yaml`
- `package.json`
- `tsconfig.json`
- `bin/tap.ts`
- `lib/tap-stack.ts`
- `function-app/package.json`
- `function-app/host.json`
- `function-app/src/intake.js`

Return only those fenced code blocks and no prose before or after them.

Export exactly these output keys:
- `PartnerIntakeApiGatewayUrl`
- `PartnerFunctionDefaultHostName`
- `PartnerIntakeStorageAccountName`
- `PartnerRawContainerName`
- `PartnerAuditContainerName`
- `PartnerIntakeQueueName`
- `PartnerLedgerTableName`
- `PartnerCommandsQueueName`
- `PartnerEventsTopicEndpoint`
- `PartnerAuditWorkflowName`
- `PartnerKeyVaultName`
- `PartnerAppInsightsName`
- `PartnerLogAnalyticsWorkspaceName`
