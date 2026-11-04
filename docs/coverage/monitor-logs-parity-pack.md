# Azure Monitor Logs Parity Pack

This pack is the local acceptance suite for Log Analytics workspace control-plane behavior before the Azure Monitor Logs capability moves closer to 99% parity. It does not replace live Azure capture for KQL, data ingestion APIs, table schemas, retention enforcement, diagnostic setting fanout, query error shapes, throttling, RBAC, private link, or exact Azure Monitor data-plane behavior.

## What It Tests

Run:

```bash
npm run e2e:monitor-logs-parity
```

The command writes:

- `dist/e2e/azure-monitor-logs-parity/results.json`
- `dist/e2e/azure-monitor-logs-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Azure Monitor Logs control/data-plane matrix | Auth rejection, malformed/wrong token rejection, subscription mismatch, missing `api-version`, missing resource group, Log Analytics workspace lifecycle, bounded local log ingestion/query behavior, unsupported workspace actions, captured diagnostic-setting rejection, ARM-template deployment, and post-delete behavior. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:monitor-logs-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Azure Monitor Logs matrix covers these deployment states:

- ARM requests without a bearer token, with malformed bearer syntax, with the wrong token, or scoped to the wrong subscription are rejected.
- Workspace create without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a workspace in a missing resource group fails with `404 ResourceGroupNotFound`.
- Empty workspace collection lists return `200` with an empty `value` array before create.
- Deleting a missing workspace returns `204`, matching the local captured delete-not-found policy.
- Empty workspace bodies fail with `400 LocationRequired`.
- Invalid workspace locations fail with `400 InvalidResourceLocation`.
- Workspace create, get, update, list, delete, post-delete get, post-delete list, and delete-after-delete behavior are covered.
- Bounded local log behavior covers invalid table rejection, empty ingest rejection, accepted JSON-object telemetry ingestion, `take`, equality `where`, `count`, unsupported KQL rejection, missing-workspace query rejection, and workspace-delete cleanup.
- Unsupported workspace actions such as shared-key and search paths fail closed instead of returning invented success.
- Diagnostic Settings create/get/list/delete preserve the current captured unsupported-resource response, rather than claiming extension-resource support.
- An ARM-template deployment can create a Log Analytics workspace through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Log Analytics workspace control-plane lifecycle, bounded local log ingestion/query checks, captured Diagnostic Settings rejection cases, unsupported workspace action boundaries, and representative platform deployment paths correctly in the local emulator. It does not mean Azure Monitor Logs is `cloudValidated` for full KQL, production data ingestion APIs, tables, schema inference, retention enforcement, diagnostic setting fanout, query errors, throttling, workspace keys, RBAC, private link, or exact Azure Monitor data-plane behavior.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
