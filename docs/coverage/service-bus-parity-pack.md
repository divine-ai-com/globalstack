# Azure Service Bus Parity Pack

This pack is the local acceptance suite for Service Bus ARM behavior and official-emulator messaging before the capability moves closer to 99% parity. It does not replace live Azure capture for RBAC, retry windows, topic filters, every dead-letter edge, sessions, duplicate-detection enforcement, or every management-plane parameter.

## What It Tests

Run:

```bash
npm run e2e:service-bus-parity
```

The command writes:

- `dist/e2e/azure-service-bus-parity/results.json`
- `dist/e2e/azure-service-bus-parity/report.md`

By default it runs three layers:

| Layer | Scope | Required Result |
|---|---|---|
| Service Bus ARM matrix | Auth rejection, malformed/wrong bearer rejection, subscription mismatch, missing `api-version`, missing resource group, captured namespace validation, missing-parent topic/queue/subscription rejection, official namespace/topic/queue/subscription naming rules, async namespace creation, get/update/list/delete/post-delete for namespaces, topics, subscriptions, and queues, fail-closed unsupported authorization-rule actions, and ARM-template deployment. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Official emulator matrix | Microsoft Service Bus emulator health plus queue send/receive/complete removal, abandon/redelivery, duplicate message-id delivery when duplicate detection is disabled, peek non-removal, dead-letter subqueue routing, topic publish/subscription receive/complete removal, and missing topic/subscription/queue rejection. | The existing `npm run e2e:service-bus` report passes. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:service-bus-parity -- --skip-emulator --skip-platforms` only for tight local debugging. `npm run validate` requires the official emulator and platform matrices.

## Current Local Coverage

The Service Bus ARM matrix covers these deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- Malformed and wrong bearer tokens fail with `401 InvalidAuthenticationToken`, and subscription mismatches fail with `403 AuthorizationFailed`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a namespace in a missing resource group fails with `404 ResourceGroupNotFound`.
- Creating or listing topics/queues/subscriptions without the required parent fails with `404 ParentResourceNotFound`.
- Empty namespace bodies fail with captured `400 LocationRequired`.
- Invalid namespace locations fail with captured `400 InvalidResourceLocation`.
- Invalid namespace SKUs fail with captured `400 ValidateResourceInfoFailedWithInvalidSkuName`.
- Invalid namespace, topic, queue, and subscription names fail according to Microsoft resource naming rules.
- New namespaces return `201` with `azure-asyncoperation`, `location`, `retry-after`, and `Creating` provisioning/status fields.
- Operation polling moves the namespace to `Succeeded`.
- Topics, queues, and subscriptions support create, idempotent update where relevant, list, delete, and post-delete `404`.
- Unsupported authorization-rule actions fail closed with an explicit GlobalStack route gap instead of returning synthetic success.
- ARM-template deployment can create a namespace, topic, subscription, and queue in one deployment request.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Service Bus control-plane, official-emulator, and platform deployment paths correctly in the local emulator. It does not mean Service Bus is `cloudValidated` for every live Azure parameter, RBAC case, data-plane error, retry behavior, session behavior, duplicate-detection enforcement edge, topic filter rule, every dead-letter path, or quota boundary.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official-emulator evidence with an explicit caveat, or an explicit out-of-scope declaration.
