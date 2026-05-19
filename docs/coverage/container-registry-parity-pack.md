# Azure Container Registry Parity Pack

This pack is the current local evidence boundary for the Tier 1 `container-registry` capability.

## Scope

- ARM resource type: `Microsoft.ContainerRegistry/registries`.
- Captured provider validation preserved for missing `location`, invalid `location`, missing `api-version`, and missing `sku`.
- Local ARM success path for registry create, update, get, list, delete, and ARM-template deployment when the request includes an Azure-shaped `sku.name`.
- Local data-plane smoke for ACR/Docker Registry host routing, bearer challenge, token issuance, `/v2/`, `/acr/v1/_catalog`, `/acr/v1/<repository>/_tags`, manifest push/get/delete, Docker tag listing, and post-delete rejection.
- All eight platform runner lifecycles execute through the GlobalStack provider path during the full parity run.

## Commands

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:container-registry-parity
```

For a faster control/data-plane-only iteration:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:container-registry-parity -- --skip-platforms
```

## Outputs

- `dist/e2e/azure-container-registry-parity/results.json`
- `dist/e2e/azure-container-registry-parity/report.md`

## Claim Boundary

This is local parity evidence for the enumerated cases only. It is not a 99%-complete or `cloudValidated` claim for Azure Container Registry.

Still explicit gaps:

- Full Docker blob upload/download protocol, blob mount, resumable upload, and digest edge cases.
- ACR Tasks, webhooks, geo-replication, private endpoints, content trust, quarantine, signing, OCI referrers, repository attributes, RBAC scope maps, throttling, and audit/event behavior.
- Exhaustive live Azure parameter variance, async state, retry, identity/RBAC, and provider/IaC edge captures.

Unknown ACR data-plane routes must keep failing closed until they are reconciled against live Azure behavior or an intentionally documented local contract.
