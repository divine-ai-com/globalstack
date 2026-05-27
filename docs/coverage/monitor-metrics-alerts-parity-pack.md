# Azure Monitor Metrics/Alerts Parity Pack

This pack is the local acceptance suite for Azure Monitor action group and metric alert control-plane behavior before the Monitor Metrics/Alerts capability moves closer to 99% parity. It does not replace live Azure capture for metric ingestion, metric definitions, time-series query semantics, alert evaluation, action execution, dynamic thresholds, dimensions, common alert schema delivery, throttling, RBAC, private link, or exact Azure Monitor data-plane behavior.

## What It Tests

Run:

```bash
npm run e2e:monitor-metrics-alerts-parity
```

The command writes:

- `dist/e2e/azure-monitor-metrics-alerts-parity/results.json`
- `dist/e2e/azure-monitor-metrics-alerts-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Azure Monitor Metrics/Alerts control-plane matrix | Auth rejection, malformed/wrong token rejection, subscription mismatch, missing `api-version`, missing resource group, action group lifecycle, metric alert lifecycle, parameter rejection, unsupported metric/action routes, ARM-template deployment, and post-delete behavior. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:monitor-metrics-alerts-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Azure Monitor Metrics/Alerts matrix covers these deployment states:

- ARM requests without a bearer token, with malformed bearer syntax, with the wrong token, or scoped to the wrong subscription are rejected.
- Action group and metric alert create without `api-version` or without an existing resource group fail before state is persisted.
- Empty action group and metric alert collection lists return `200` with an empty `value` array before create.
- Deleting missing action groups and metric alerts returns `204`, matching the local captured delete-not-found policy.
- Empty bodies and invalid locations fail.
- Action groups reject missing short names and invalid `enabled` types.
- Metric alerts reject missing severity, invalid severity, missing scopes, missing criteria, and invalid `enabled` types.
- Action group create, get, update, list, delete, post-delete get, post-delete list, and delete-after-delete behavior are covered.
- Metric alert create, get, update, list, delete, post-delete get, post-delete list, and delete-after-delete behavior are covered.
- Unsupported action-group receiver actions, metric-alert status routes, and metric query extension routes fail closed instead of returning invented success.
- An ARM-template deployment can create an action group and metric alert through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed action group and metric alert control-plane lifecycle, local parameter rejection cases, unsupported metric/action boundaries, and representative platform deployment paths correctly in the local emulator. It does not mean Azure Monitor Metrics or Alerts is `cloudValidated` for metric ingestion, metric definitions, query aggregation, alert evaluator timing, action delivery, dynamic thresholds, dimensions, schema delivery, throttling, RBAC, private link, or exact Azure Monitor data-plane behavior.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
