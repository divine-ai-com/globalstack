# Azure Service Bus Parity Pack

This pack is the local acceptance suite for Service Bus ARM behavior and official-emulator messaging before the capability moves closer to 99% parity. It does not replace live Azure capture for RBAC, retry windows, topic filters, DLQ behavior, or every management-plane parameter.

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
| Service Bus ARM matrix | Auth rejection, missing `api-version`, missing resource group, captured namespace validation, official namespace/topic/queue/subscription naming rules, async namespace creation, get/update/list/delete/post-delete for namespaces, topics, subscriptions, and queues. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Official emulator matrix | Microsoft Service Bus emulator health plus queue send/receive, topic publish/subscription receive, and missing queue rejection. | The existing `npm run e2e:service-bus` report passes. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:service-bus-parity -- --skip-emulator --skip-platforms` only for tight local debugging. `npm run validate` requires the official emulator and platform matrices.

## Current Local Coverage

The Service Bus ARM matrix covers these deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a namespace in a missing resource group fails with `404 ResourceGroupNotFound`.
- Empty namespace bodies fail with captured `400 LocationRequired`.
- Invalid namespace locations fail with captured `400 InvalidResourceLocation`.
- Invalid namespace SKUs fail with captured `400 ValidateResourceInfoFailedWithInvalidSkuName`.
- Invalid namespace, topic, queue, and subscription names fail according to Microsoft resource naming rules.
- New namespaces return `201` with `azure-asyncoperation`, `location`, `retry-after`, and `Creating` provisioning/status fields.
- Operation polling moves the namespace to `Succeeded`.
- Topics, queues, and subscriptions support create, idempotent update where relevant, list, delete, and post-delete `404`.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Service Bus control-plane, official-emulator, and platform deployment paths correctly in the local emulator. It does not mean Service Bus is `cloudValidated` for every live Azure parameter, RBAC case, data-plane error, retry behavior, session behavior, duplicate detection edge, topic filter rule, dead-letter path, or quota boundary.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official-emulator evidence with an explicit caveat, or an explicit out-of-scope declaration.
