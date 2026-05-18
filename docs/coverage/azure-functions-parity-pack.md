# Azure Functions Parity Pack

This pack is the local acceptance suite for Azure Functions server farm and Function App behavior before the capability moves closer to 99% parity. It does not replace live Azure capture for deployment packages, trigger sync, scale controller behavior, non-HTTP triggers, Durable Functions, deployment slots, runtime image builds, managed identity token behavior, binding retries, or every management-plane parameter.

## What It Tests

Run:

```bash
npm run e2e:azure-functions-parity
```

The command writes:

- `dist/e2e/azure-functions-parity/results.json`
- `dist/e2e/azure-functions-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Azure Functions ARM and HTTP-trigger matrix | Auth rejection, missing `api-version`, missing resource group, captured server farm validation, documented server farm and Function App success shapes, async provisioning, Function App create/update/list/delete/post-delete, ARM-template deployment, and local HTTP-trigger rejection/routing. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:azure-functions-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Azure Functions matrix covers these deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a server farm in a missing resource group fails with `404 ResourceGroupNotFound`.
- Empty server farm and Function App bodies fail with captured `400 LocationRequired`.
- Invalid server farm and Function App locations fail with captured `400 InvalidResourceLocation`.
- Invalid server farm SKU preserves the captured `400 BadRequest` response.
- Minimal server farm bodies preserve the captured `401 Unauthorized` quota response.
- Locally supported Function App server farms require real Azure fields: `kind: functionapp`, `sku.name: Y1`, `sku.tier: Dynamic`, and `properties.reserved`.
- New server farms and Function Apps return async-operation headers, transitional provisioning states, and then `Succeeded`.
- Function Apps require `kind` to include `functionapp`, `properties.serverFarmId`, and a server farm that already exists in the local ARM store.
- Function App names and server farm names are rejected when they violate the local Azure-shaped naming rules.
- Function App updates preserve generated host metadata like `<app>.azurewebsites.net`.
- The local Functions router rejects unknown apps, unknown routes, disallowed methods, and missing function keys.
- Anonymous HTTP triggers and function-key protected HTTP triggers route to local inspection responses for integration-test smoke.
- An ARM-template deployment can create the server farm and Function App together through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Functions control-plane, local HTTP-trigger smoke, captured validation, and representative platform deployment paths correctly in the local emulator. It does not mean Azure Functions is `cloudValidated` for packaging, trigger sync, host runtime worker behavior, scale controller decisions, Service Bus/Event Grid/blob/timer triggers, Durable Functions orchestration semantics, slots, managed identity tokens, app settings encryption, VNet integration, deployment failures, or every live Azure validation edge.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
