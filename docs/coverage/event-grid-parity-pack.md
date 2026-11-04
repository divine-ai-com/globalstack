# Azure Event Grid Parity Pack

This pack is the local acceptance suite for Event Grid topic management and publish behavior before the capability moves closer to 99% parity. It does not replace live Azure capture for webhook validation handshakes, delivery retries, advanced filters, partner events, CloudEvents pull delivery, RBAC, private networking, or dead-letter behavior.

## What It Tests

Run:

```bash
npm run e2e:event-grid-parity
```

The command writes:

- `dist/e2e/azure-event-grid-parity/results.json`
- `dist/e2e/azure-event-grid-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Event Grid ARM and publish matrix | Auth rejection, malformed/wrong bearer rejection, subscription mismatch, missing `api-version`, missing resource group, captured topic validation, empty list/delete-not-found, topic create/update/get/list/delete/post-delete, topic `listKeys`, fail-closed unsupported topic actions, ARM-template deployment, Event Grid publish URL shape, invalid publish authentication, invalid method/path/host, invalid publish body/schema/overload, successful `EventGridEvent` and `customEvent` publish, and captured top-level event subscription rejection. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:event-grid-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Event Grid matrix covers these deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- Malformed and wrong bearer tokens fail with `401 InvalidAuthenticationToken`, and subscription mismatches fail with `403 AuthorizationFailed`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a topic in a missing resource group fails with `404 ResourceGroupNotFound`.
- Empty topic lists return `200` with no values, while deleting a missing topic preserves Azure no-content behavior.
- Empty topic bodies fail with captured `400 LocationRequired`.
- Invalid topic locations fail with captured `400 InvalidResourceLocation`.
- Invalid topic names fail according to Azure naming constraints.
- New topics return `201`, `Succeeded`, and a topic endpoint shaped like `https://<topic>.<region>-1.eventgrid.azure.net/api/events`.
- Topic `listKeys` returns deterministic local shared access keys for data-plane publish authentication.
- Unsupported topic actions fail closed with an explicit GlobalStack route gap instead of synthetic success.
- ARM-template deployment can create an Event Grid topic in a deployment request.
- Publish requests use the real Event Grid topic endpoint path `/api/events?overload=...&api-version=2018-01-01`.
- Missing or invalid keys, wrong methods, wrong paths, non-Event Grid hosts, unknown topics, malformed JSON, empty batches, malformed batches, invalid event schemas, and unsupported overloads are rejected.
- Valid `EventGridEvent` and `customEvent` batches are accepted and recorded for local inspection.
- Top-level `Microsoft.EventGrid/eventSubscriptions` create keeps the captured provider-readiness rejection instead of pretending subscription delivery is implemented.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Event Grid topic control-plane, shared-key publish, strict publish rejection, local event capture, and platform deployment paths correctly in the local emulator. It does not mean Event Grid is `cloudValidated` for every live Azure parameter, RBAC case, event subscription destination, webhook validation handshake, retry schedule, advanced filter, private endpoint, partner event, CloudEvent pull delivery, dead-letter path, or quota boundary.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
