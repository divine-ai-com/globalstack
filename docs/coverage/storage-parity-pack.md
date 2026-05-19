# Azure Storage Parity Pack

This pack is the local acceptance suite for storage-family ARM behavior before a service claim moves closer to 99% parity. It complements the Azurite data-plane hardening suite; it does not replace live Azure capture.

## What It Tests

Run:

```bash
npm run e2e:storage-parity
```

The command writes:

- `dist/e2e/azure-storage-parity/results.json`
- `dist/e2e/azure-storage-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Storage ARM matrix | Auth rejection, missing `api-version`, missing resource group, invalid account name, invalid SKU, async storage account creation, parent-not-ready child rejection, child naming rejects, get/list/update/delete/post-delete for blob containers, queues, file shares, and tables, plus ARM-template deployment. | Every enumerated positive and negative case passes with Azure-shaped status and error code expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:storage-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the full platform matrix.

## Current Local Coverage

The storage ARM matrix covers these real deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a storage account in a missing resource group fails with `404 ResourceGroupNotFound`.
- Invalid storage account names fail with `400 AccountNameInvalid`.
- Invalid storage account SKUs fail with `400 InvalidAccountType`.
- New storage accounts return `202` with `azure-asyncoperation`, `location`, and `retry-after`.
- Child resources fail with `409 StorageAccountIsNotProvisioned` until the storage account reaches `Succeeded`.
- Invalid blob container, queue, file share, and table names fail closed with `400 InvalidResourceName`.
- Blob containers, queues, file shares, and tables support create, idempotent update, list, delete, and Azure-shaped post-delete `404` responses.
- ARM template deployment can create a storage account with blob, queue, and table child resources in one deployment.

## Claim Boundary

Passing this pack means GlobalStack handles the listed storage control-plane and platform deployment paths correctly in the local emulator. It does not mean storage is `cloudValidated` for every live Azure parameter or every data-plane edge.

Keep `docs/coverage/storage-hardening.md` as the backlog and evidence tracker for live Azure storage captures. Promote a behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence or official-emulator evidence with an explicit caveat.
