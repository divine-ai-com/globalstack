# Agent Runbook

Use this when changing the repo. It is written for future agents that need to move quickly without blurring support claims.

## Before Editing

1. Read `docs/START-HERE.md`.
2. Read `docs/CURRENT-MISSION.md`.
3. Read `docs/CONFORMANCE-MODEL.md`.
4. Check the generated scope in `docs/SERVICE-SCOPE.md`.
5. Confirm the work stays under `/home/ubuntu/globalstack`.

## Normal Regeneration

```bash
npm run fetch:azure-coverage
npm run render
npm run hybrid:render
npm run conformance:catalog
npm run conformance:classify
npm run conformance:expectations
npm run lifecycle:expectations
npm run conformance:checklist
npm run docs:nav
```

## Normal Validation

```bash
npm run smoke
npm run providers:gaps
```

During parity-pack development, use the short feedback loop first and the full platform loop only once the service matrix is stable:

1. Run the service-specific E2E pack with `--skip-platforms` while editing GlobalStack behavior.
2. Before commit, run the same service-specific E2E pack without `--skip-platforms` so all eight platform runners exercise native IaC/CLI calls through the GlobalStack provider route.
3. Run `npm run validate` before commit and push.
4. Run full `npm run smoke` periodically or after shared platform-runner, image, auth, provider-routing, or repo-wide validation changes.

This keeps local development fast while preserving the end-to-end guarantee that Terraform, OpenTofu, Pulumi TS, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON still deploy through the GlobalStack path.

After any command that starts Docker-based emulators:

```bash
sudo -n docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' | rg 'globalstack-azure|globalstack-azurite-e2e|azurite' || true
```

Run the Bicep reference platform lifecycle:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:bicep-runner
```

Expected result is runner exit code `0`, `reports/deployment-response.json` with `properties.provisioningState == "Succeeded"`, and `reports/lifecycle-report.json` ending at `destroy` with `status == "PASS"`.

Run the complete platform runner lifecycle matrix:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:platform-runners
```

Expected result is `8/8` platforms passing in `dist/platform-lifecycle-smoke-results.json`. Every platform should end at `destroy` with `finalStatus == "PASS"` and `provisioningState == "Succeeded"`. Terraform and OpenTofu run native AzAPI provider apply/destroy through the selected provider endpoint. Pulumi TypeScript, Pulumi Python, and Pulumi YAML run native Pulumi Azure Native up/destroy through runner-transparent GlobalStack routing. Ansible runs native `azure.azcollection` modules through the same routing. ARM JSON validates and deploys the shared ARM contract directly.

Platform tasks can pin their backend in `metadata.json`:

```json
{ "provider": "GlobalStack" }
```

Metadata takes precedence over `PROVIDER` / `CLOUD_PROVIDER`. Use `provider=GlobalStack` for local smoke. Use `provider=Azure` only when real Azure credentials, a real `ARM_SUBSCRIPTION_ID`, cleanup checks, and cost controls are in place.

Run the storage parity pack after changing storage ARM behavior or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:storage-parity
```

Expected result is `dist/e2e/azure-storage-parity/results.json` with `ok == true`, zero control-plane failures, and all eight platform runners passing. This suite covers auth rejection, missing `api-version`, missing resource groups, invalid storage names/SKUs, async storage readiness, child resource lifecycle, post-delete errors, and representative IaC deployment lifecycles.

Run the Service Bus parity pack after changing Service Bus ARM behavior, official emulator wiring, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:service-bus-parity
```

Expected result is `dist/e2e/azure-service-bus-parity/results.json` with `ok == true`, zero control-plane failures, the official Service Bus emulator matrix passing, and all eight platform runners passing. This suite covers captured namespace validation, malformed/wrong auth and subscription mismatch, missing-parent topic/queue/subscription rejection, official naming-rule rejection, async namespace readiness, topic/queue/subscription lifecycle, fail-closed unsupported authorization-rule actions, ARM-template deployment, post-delete errors, official-emulator send/receive/complete, abandon/redelivery, duplicate message-id delivery when duplicate detection is disabled, peek non-removal, dead-letter subqueue routing, missing entity rejection, and representative IaC deployment lifecycles.

Run the Event Hubs parity pack after changing Event Hubs namespace behavior, event hub child behavior, unsupported Event Hubs route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:event-hubs-parity
```

Expected result is `dist/e2e/azure-event-hubs-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 51 Event Hubs cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, namespace and event hub lifecycle, stricter namespace/event hub parameter rejection, local publish/read partition facade behavior, deterministic partition-key routing, duplicate message IDs, batch publish validation, max-event reads, unsupported authorization-rule and consumer-group routes failing closed, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Event Grid parity pack after changing Event Grid ARM behavior, local event routing, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:event-grid-parity
```

Expected result is `dist/e2e/azure-event-grid-parity/results.json` with `ok == true`, zero control/data-plane failures, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, topic validation, topic lifecycle, topic `listKeys`, fail-closed unsupported topic actions, ARM-template deployment, Event Grid publish URL shape, invalid publish auth/method/path/host/body/schema/overload rejection, local event capture, top-level event subscription captured rejection, post-delete errors, and representative IaC deployment lifecycles.

Run the API Management parity pack after changing APIM ARM behavior, local gateway routing, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:api-management-parity
```

Expected result is `dist/e2e/azure-api-management-parity/results.json` with `ok == true`, zero control/gateway-plane failures, at least 50 APIM cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, captured APIM service validation, delete-not-found behavior, async service readiness, service/API collection and lifecycle behavior, unsupported APIM action fail-closed behavior, gateway host/path rejection, subscription-key rejection and local-key smoke routing, ARM-template deployment, post-delete route errors, and representative IaC deployment lifecycles.

Run the Azure PostgreSQL parity pack after changing PostgreSQL Flexible Server ARM behavior, database child behavior, unsupported PostgreSQL route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:postgresql-parity
```

Expected result is `dist/e2e/azure-postgresql-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 42 PostgreSQL cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Flexible Server lifecycle, database child lifecycle, parameter rejection, local PostgreSQL backing-engine create/insert/select/rollback/error behavior, unsupported firewall/configuration route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Cosmos DB NoSQL/Table parity pack after changing Cosmos DB account ARM behavior, SQL database/container child behavior, Storage Table routing, unsupported Cosmos route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:cosmos-parity
```

Expected result is `dist/e2e/azure-cosmos-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 58 Cosmos/Table cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Cosmos DB account lifecycle, SQL database/container child lifecycle, Cosmos SQL REST-shaped local document create/read/replace/query/delete behavior, Storage Table lifecycle reuse, parameter rejection, unsupported MongoDB/stored-procedure route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure MySQL parity pack after changing MySQL Flexible Server ARM behavior, database child behavior, unsupported MySQL route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:mysql-parity
```

Expected result is `dist/e2e/azure-mysql-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 42 MySQL cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Flexible Server lifecycle, database child lifecycle, parameter rejection, local MySQL backing-engine create/insert/select/rollback/error behavior, unsupported firewall/configuration route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Redis parity pack after changing Azure Cache for Redis ARM behavior, endpoint metadata, unsupported Redis route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:redis-parity
```

Expected result is `dist/e2e/azure-redis-parity/results.json` with `ok == true`, zero control-plane failures, at least 25 Redis cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Redis cache lifecycle, parameter rejection, unsupported firewall/linked-server route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Logic Workflows parity pack after changing Logic Apps workflow ARM behavior, definition validation, unsupported workflow route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:logic-workflows-parity
```

Expected result is `dist/e2e/azure-logic-workflows-parity/results.json` with `ok == true`, zero control-plane failures, at least 25 Logic workflow cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Logic workflow lifecycle, definition/state rejection, unsupported trigger/version route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Functions parity pack after changing Microsoft.Web server farm or Function App ARM behavior, local HTTP-trigger routing, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:azure-functions-parity
```

Expected result is `dist/e2e/azure-functions-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 57 Azure Functions cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, captured server farm validation, collection and delete-not-found behavior, async server farm and Function App readiness, missing-plan rejection, unsupported function action fail-closed behavior, local HTTP-trigger route rejection, function-key rejection and wrong-key rejection, ARM-template deployment, post-delete route/list/get errors, and representative IaC deployment lifecycles.

Run the identity/RBAC parity pack after changing local token issuance, Managed Identity ARM behavior, authorization resource validation, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:identity-rbac-parity
```

Expected result is `dist/e2e/azure-identity-rbac-parity/results.json` with `ok == true`, zero control/token-plane failures, at least 42 identity/RBAC cases, and all eight platform runners passing. This suite covers OpenID/JWKS discovery, local token rejection and issuance, malformed/wrong ARM auth and subscription mismatch, Managed Identity lifecycle, unsupported Managed Identity action fail-closed behavior, captured RBAC create rejection, RBAC not-found/delete-not-found behavior, ARM-template deployment, and representative IaC deployment lifecycles.

Run the Azure Monitor Logs parity pack after changing Log Analytics workspace ARM behavior, Diagnostic Settings validation, unsupported Monitor action handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:monitor-logs-parity
```

Expected result is `dist/e2e/azure-monitor-logs-parity/results.json` with `ok == true`, zero control-plane failures, at least 29 Monitor Logs cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, workspace lifecycle, unsupported workspace action fail-closed behavior, captured Diagnostic Settings rejection behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Monitor Metrics/Alerts parity pack after changing action group behavior, metric alert behavior, unsupported Monitor metrics route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:monitor-metrics-alerts-parity
```

Expected result is `dist/e2e/azure-monitor-metrics-alerts-parity/results.json` with `ok == true`, zero control-plane failures, at least 42 Monitor Metrics/Alerts cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, action group and metric alert lifecycle, parameter rejection, unsupported metric/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Virtual Network parity pack after changing VNet, subnet, Private Endpoint, Private DNS zone, unsupported Network route handling, async Network behavior, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:virtual-network-parity
```

Expected result is `dist/e2e/azure-virtual-network-parity/results.json` with `ok == true`, zero control-plane failures, at least 55 Azure Network cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, VNet lifecycle, subnet lifecycle, Private Endpoint lifecycle, Private DNS zone async lifecycle, parameter rejection, unsupported Network child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure DNS Zones parity pack after changing public DNS zones, Private DNS zones, record-set validation, Private DNS virtual network links, unsupported DNS route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:dns-zones-parity
```

Expected result is `dist/e2e/azure-dns-zones-parity/results.json` with `ok == true`, zero control-plane failures, at least 55 Azure DNS cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, public/private DNS zone lifecycle, public/private record-set lifecycle across supported record types, record parameter rejection, Private DNS virtual network link metadata, unsupported DNS child route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Load Balancing parity pack after changing Application Gateway behavior, Load Balancer behavior, unsupported load-balancing route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:load-balancing-parity
```

Expected result is `dist/e2e/azure-load-balancing-parity/results.json` with `ok == true`, zero control-plane failures, at least 45 Azure load-balancing cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Application Gateway and Load Balancer lifecycle, frontend/listener/backend/probe parameter rejection, unsupported child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Front Door/CDN parity pack after changing Microsoft.Cdn profile, Front Door endpoint, CDN endpoint, unsupported CDN route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:front-door-cdn-parity
```

Expected result is `dist/e2e/azure-front-door-cdn-parity/results.json` with `ok == true`, zero control-plane failures, at least 35 Front Door/CDN cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, CDN profile lifecycle, Front Door and CDN endpoint lifecycle, stricter SKU/origin/flag rejection, unsupported child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure WAF Policy parity pack after changing Application Gateway WAF policy behavior, CDN security policy behavior, unsupported WAF route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:waf-policy-parity
```

Expected result is `dist/e2e/azure-waf-policy-parity/results.json` with `ok == true`, zero control-plane failures, at least 35 WAF cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Application Gateway WAF policy lifecycle, CDN security policy lifecycle, stricter policy settings/managed-rule/association rejection, unsupported child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Activity Log Audit parity pack after changing Event Grid system-topic behavior, diagnostic-setting rejection behavior, unsupported audit route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:activity-log-audit-parity
```

Expected result is `dist/e2e/azure-activity-log-audit-parity/results.json` with `ok == true`, zero control-plane failures, at least 25 Activity Log Audit cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Event Grid system-topic lifecycle, stricter source/topicType rejection, captured diagnostic-setting root-scope rejection, unsupported child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Synapse Warehouse parity pack after changing Synapse workspace behavior, dedicated SQL pool behavior, unsupported Synapse route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:synapse-warehouse-parity
```

Expected result is `dist/e2e/azure-synapse-warehouse-parity/results.json` with `ok == true`, zero control-plane failures, at least 35 Synapse cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, workspace lifecycle, dedicated SQL pool lifecycle, stricter workspace identity/data-lake and SQL pool SKU/createMode rejection, unsupported child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Database Migration Service parity pack after changing migration service behavior, migration project behavior, unsupported DMS route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:database-migration-service-parity
```

Expected result is `dist/e2e/azure-database-migration-service-parity/results.json` with `ok == true`, zero control-plane failures, at least 35 DMS cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, DMS service lifecycle, migration project lifecycle, stricter SKU/public-access/source-target rejection, unsupported child/action route fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Service Discovery parity pack after changing Private DNS, Container Apps managed environment, Container App, unsupported service-discovery route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:service-discovery-parity
```

Expected result is `dist/e2e/azure-service-discovery-parity/results.json` with `ok == true`, zero control-plane failures, at least 30 Service Discovery cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, Private DNS zone lifecycle, Container Apps managed environment lifecycle, Container App lifecycle, managed-environment reference checks, stricter container/scale rejection, unsupported Container Apps child/action routes failing closed, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Files parity pack after changing Storage file share behavior, Azure NetApp explicit-gap behavior, unsupported file route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:azure-files-parity
```

Expected result is `dist/e2e/azure-files-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 46 Azure Files cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, storage account readiness, file share lifecycle, stricter quota/protocol/tier rejection, Azure Files REST-shaped local directory/file create, range upload, read, list, delete, unsupported share routes failing closed, explicit Azure NetApp parent-gap behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure App Configuration parity pack after changing App Configuration store ARM behavior, unsupported App Configuration route handling, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:app-configuration-parity
```

Expected result is `dist/e2e/azure-app-configuration-parity/results.json` with `ok == true`, zero control/data-plane failures, at least 25 control-plane cases, at least 23 data-plane cases, and all eight platform runners passing. This suite covers malformed/wrong auth and subscription mismatch, App Configuration store lifecycle, stricter SKU/local-auth/public-network rejection, key-value data-plane lifecycle, labels, ETag preconditions, lock/unlock rejection behavior, unsupported key-value/feature-flag/list-key routes failing closed, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Key Vault parity pack after changing Key Vault vault, secret, key, local data-plane, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:key-vault-parity
```

Expected result is `dist/e2e/azure-key-vault-parity/results.json` with `ok == true`, zero control/data-plane failures, and all eight platform runners passing. This suite covers captured vault validation, missing-parent key/secret rejection, ARM child delete boundaries, malformed auth and API-version rejects, local secret set/get/version-list/delete, disabled-secret rejection, deleted-secret get/recover/purge lifecycle, local RSA key create/get/list/encrypt/decrypt/delete with `key_ops` enforcement, fail-closed unsupported secret actions, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Container Registry parity pack after changing ACR registry ARM behavior, local registry data-plane routing, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:container-registry-parity
```

Expected result is `dist/e2e/azure-container-registry-parity/results.json` with `ok == true`, zero control/data-plane failures, and all eight platform runners passing. This suite covers captured missing-SKU validation, registry naming and SKU rejection, registry lifecycle, local ACR token/challenge behavior, Docker Registry manifest push/get/delete, ACR catalog and tag listing, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

Run the Azure Kubernetes Service metadata parity pack after changing AKS managed cluster ARM behavior, credential action metadata, or platform deployment routing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:aks-metadata-parity
```

Expected result is `dist/e2e/azure-aks-metadata-parity/results.json` with `ok == true`, zero control-plane failures, and all eight platform runners passing. This suite covers captured servicePrincipalProfile validation, cluster naming and node-pool rejection, async managed-cluster metadata lifecycle, local kubeconfig action metadata, unsupported action fail-closed behavior, ARM-template deployment, post-delete errors, and representative IaC deployment lifecycles.

After any real Azure capture:

```bash
az group list --query "[?starts_with(name, 'rg-gs-life-') || starts_with(name, 'rg-gs-conf-') || tags.purpose == 'globalstack-conformance' || tags.purpose == 'globalstack-lifecycle'].{name:name,provisioningState:properties.provisioningState,location:location,tags:tags}" --output json
```

The expected result is `[]`.

## Adding A Capability

1. Add the capability to `packages/core/src/azure-tier1-capabilities.mjs`.
2. Include AWS analogue, Azure equivalent, resource types, backing engines, known gaps, and `realAzureCaptureRequired`.
3. Regenerate the API catalog.
4. Add local route support only if the behavior can fail closed or has captured validation.
5. Add tests before claiming support.
6. Regenerate `docs/SERVICE-SCOPE.md`.

## Adding A Captured Validation

1. Capture the exact Azure request and response.
2. Verify cleanup.
3. Classify the capture.
4. Add or update provider validation only for the exact behavior captured.
5. Render local expectations.
6. Add or update replay tests.
7. Run `npm run smoke`.

## Real Azure Capture Gates

Generic capture:

```bash
GLOBALSTACK_REAL_AZURE_CAPTURE=1 npm run capture:azure -- <fixture-id> <request-json>
```

Conformance capture:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<capability-id> --case=<case-id>
```

Storage lifecycle capture:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run lifecycle:capture:storage
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run lifecycle:capture:storage -- --wait-ready=true
```

Do not run broad real Azure capture waves without a cleanup plan, subscription awareness, and an explicit reason.

## Common Mistakes To Avoid

- Treating any third-party emulator coverage as proof that behavior is implemented here.
- Treating an official emulator data-plane pass as proof of ARM management-plane parity.
- Treating a `provider-accepted` capture as full success-state validation.
- Turning `capture-infrastructure-gap` into local emulator behavior.
- Making local tests pass by accepting invalid Azure request shapes.
- Forgetting that parent-missing and parent-not-ready are different Azure states.
- Leaving generated duplicate fixtures that double-count evidence.
