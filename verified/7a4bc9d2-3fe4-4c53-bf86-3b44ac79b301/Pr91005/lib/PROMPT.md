An enterprise B2B intake team needs a serious Azure integration slice, not a toy deployment. External partners submit compliance packages over HTTPS. The public API surface must be published through Azure API Management. The backend must be an Azure Function App. Valid intake requests must land durable state in Azure Storage, enqueue downstream work in Azure Service Bus, publish a business event through Azure Event Grid, and trigger a Logic App audit workflow. Secrets must live in Azure Key Vault. Operational telemetry must be routed into Azure Monitor through Log Analytics and Application Insights.

I want this written in Pulumi Azure TypeScript.

Build an Azure deployment in eastus for this exact end-to-end flow:
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

The deployment must support these runtime semantics:
- a valid request sent through API Management returns HTTP 202 with a JSON body containing `partnerId`, `batchId`, `status`, and `rawBlobPath`
- a direct request to the Function intake endpoint without the required shared header returns HTTP 401
- a request missing `partnerId`, `batchId`, `submittedAt`, or a non-empty `documents` array returns HTTP 400 and must not create blob, table, Service Bus, or Event Grid side effects
- a valid request must create:
  - one raw blob at `raw/{partnerId}/{batchId}.json`
  - one table entity in the intake ledger table with `PartitionKey = partnerId` and `RowKey = batchId`
  - one Service Bus queue message whose body includes `partnerId`, `batchId`, `submittedAt`, and `documentCount`
  - one Event Grid event with subject `/partners/{partnerId}/batches/{batchId}` and event type `Partner.Intake.Accepted`
  - one audit blob at `audit/{partnerId}/{batchId}.json` after the Logic App workflow runs

Use this exact sample request contract for the intake route:
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

Use this exact Azure resource contract:
- Use the package root imports from `@pulumi/azure-native` only. Do not import nonexistent versioned namespace paths.
- Create one StorageV2 storage account with sku `Standard_LRS`, `allowBlobPublicAccess = false`, `minimumTlsVersion = TLS1_2`, and `enableHttpsTrafficOnly = true`.
- Create the raw and audit blob containers directly as `storage.BlobContainer` resources with `publicAccess = storage.PublicAccess.None`.
- Create the queue and table directly as `storage.Queue` and `storage.Table` resources. Do not introduce helper resources such as `blobServices/default`, `queueServices/default`, or `tableServices/default` in this platform.
- Create one Service Bus namespace with sku `Standard`, and one queue named `partner-intake-commands` with `maxDeliveryCount = 10`.
- Create one custom Event Grid topic with `inputSchema = EventGridSchema`.
- Create one App Service plan for the Function App and one Function App that runs Node.js code from a deployable package staged by Pulumi.
- Put the Function code in the task itself. Do not leave the backend as a placeholder or assume code is deployed separately.
- The Function App must expose two HTTP routes:
  - `POST /api/intake`
  - `POST /api/audit`
- The `POST /api/intake` route must require header `x-partner-shared-key`. That expected value must come from an app setting backed by an Azure Key Vault reference, not a hardcoded literal.
- Use Key Vault to store the shared key secret, assign managed identity-based read access, and configure the Function App to resolve the Key Vault reference at runtime.
- Configure API Management so the published `POST /partner-intake` operation forwards to the Function intake route and injects the shared header by using a named value backed by the same Key Vault secret.
- Create one Logic App workflow using `Microsoft.Logic/workflows` that receives Event Grid deliveries and calls the Function audit route with the event payload.
- Create one Event Grid event subscription from the topic to the Logic App callback endpoint.
- Create one API Management API with one `POST /partner-intake` operation and one product association for that API.
- Create one Log Analytics workspace and one Application Insights component.
- Route diagnostic telemetry from API Management, the Function App, the Logic App, and the Event Grid topic into Log Analytics where the resource type supports diagnostic settings.
- Wire the Function App to Application Insights by app settings or connection string output from the deployed Application Insights resource.
- Do not add out-of-scope services such as Cosmos DB, PostgreSQL, AKS, Container Apps, Front Door, private endpoints, or custom domains.
- Do not use random suffix generators. Use the exact names provided.

Use these exact implementation expectations inside the Function code:
- `POST /api/intake`
  - parse JSON
  - validate `partnerId`, `batchId`, `submittedAt`, and a non-empty `documents` array
  - reject invalid payloads with HTTP 400
  - reject requests without the correct `x-partner-shared-key` header with HTTP 401
  - write the raw body to Blob Storage path `raw/{partnerId}/{batchId}.json`
  - insert or replace a table entity with:
    - `PartitionKey = partnerId`
    - `RowKey = batchId`
    - `status = Queued`
    - `documentCount = documents.length`
    - `submittedAt = submittedAt`
  - send one Service Bus queue message with a JSON body carrying `partnerId`, `batchId`, `submittedAt`, and `documentCount`
  - publish one Event Grid event carrying the same identifiers and the raw blob path
  - return HTTP 202 with JSON `{ "partnerId": "...", "batchId": "...", "status": "Queued", "rawBlobPath": "raw/.../...json" }`
- `POST /api/audit`
  - accept the event payload produced by the Logic App
  - validate that the payload contains `partnerId` and `batchId`
  - write one audit blob at `audit/{partnerId}/{batchId}.json`
  - return HTTP 202

Use these exact Pulumi conventions:
- Set `Pulumi.yaml` main to `bin/tap.ts`.
- Put the entry point in `bin/tap.ts`.
- Put the reusable stack construction in `lib/tap-stack.ts`.
- Name the stack factory function `createTapStack` and import that exact symbol from `bin/tap.ts`.
- Use this conservative dependency set in `package.json`:
  - `@pulumi/azure-native`: `^2.80.0`
  - `@pulumi/pulumi`: `^3.122.0`
  - `@azure/data-tables`: `^13.3.0`
  - `@azure/storage-blob`: `^12.26.0`
  - `@azure/service-bus`: `^7.9.5`
  - `@azure/eventgrid`: `^5.12.0`
  - `@types/node`: `^20.0.0`
  - `ts-node`: `^10.9.2`
  - `typescript`: `^5.0.0`
- Keep resource construction deterministic. No random names, no placeholders, no TODO comments, no "implement later" handlers.

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
