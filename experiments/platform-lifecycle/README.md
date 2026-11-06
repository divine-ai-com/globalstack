# Platform lifecycle captures

This experiment extends the resource-group lifecycle to all nine [registered Azure platforms](../../packages/platform-registry/src/index.mjs). Each tool uses its native program and an explicit lifecycle described in [the plan](PLAN.md). Local implementation checks are in progress. The existing [Terraform paired snapshots](../paired-lifecycle/SNAPSHOTS.md) are the only completed live comparison so far; their results do not stand in for the other platforms.

Run one local platform with its existing pinned validation image:

```bash
node experiments/platform-lifecycle/run.mjs --platform=azure-ansible-yaml --target=local
```

Results go into a unique, private `reports/platform-lifecycle` directory. The result includes command arguments, exit codes, UTC intervals, bounded sanitized stdout/stderr, native HTTP exchanges, direct probes, cleanup outcomes, source hashes and tool image identity. Package/plugin caches are shared under `reports/platform-lifecycle-cache`; credentials and native state are per-run and removed after verified absence. Keep at least 40 GiB free.

The external CLI token adapter supplies already obtained identity context to clients without changing their IaC source. It does not test Entra authentication. The ARM observer forwards bytes without rewriting responses. It restricts writes to the generated group and, for Bicep/ARM, the exact frozen deployment template and parameter sets. Read-only inventory for that group and required subscription discovery are permitted. Request and response capture still uses selected headers.

The Ansible runner uses `azure.azcollection` and CLI credentials. CLI REST uses real `az rest` commands. Bicep compiles with the Bicep CLI and submits the compiled template through `az rest`; ARM JSON submits its template through the same API. Neither is presented as an `az deployment ...` command capture. HCL and Pulumi use their native providers. Tool families without Terraform-style state/import do not receive fabricated state stages.

## Portal capture gate

Do not start an Azure target until a signed-in, controllable Azure Portal browser is ready. `PAIRED_PORTAL_CAPTURE_READY=1` is an operator assertion, not proof of browser readiness. Live execution also requires the explicit authorized USD ceiling, the signed-in subscription ID and the private Azure CLI configuration directory. The broader pilot ceiling remains USD 100 total.

After creation and update, the runner writes a private `portal-request.json` and waits at most two minutes for the corresponding `portal-created.json` or `portal-updated.json`. Capture the actual portal resource view during that window. The receipt must contain `source: "Azure Portal"`, the requested phase and resource ID, a UTC `capturedAt` after the request, a basename-only PNG `file`, its `sha256`, and a description of any privacy masks. Do not fabricate receipts or substitute report screenshots. Files and receipts remain private until publication review.

Missing screenshots fail the run and trigger cleanup. The independent watchdog stops the owned container and removes the owned empty group if the controller exits or exceeds its deadline. Bicep/ARM cleanup also verifies the deployment parameters before removing the owned deployment record. Cleanup failure preserves the private recovery context and blocks subsequent targets. Host failure still requires external recovery.

## Newly observed local gaps

Ansible's resource-group reconciliation reads the group's generic resource inventory and uses HEAD existence checks. The older Terraform pilot did not exercise those requests. The local implementation now handles unfiltered inventory reads and resource-group HEAD. OData inventory filters, expansions and limits return an explicit unsupported response rather than silently returning the wrong list. These corrections are based on the [Azure existence contract](https://learn.microsoft.com/en-us/rest/api/resources/resource-groups/check-existence?view=rest-resources-2021-04-01) and [resource inventory contract](https://learn.microsoft.com/en-us/rest/api/resources/resources/list-by-resource-group?view=rest-resources-2021-04-01); a new live paired capture is still required.

Bicep also exposed a missing deployment-history DELETE operation. The shared subscription and resource-group handlers now delete only the deployment record, return a completion-poll URL, and leave deployed resources intact. Tests cover missing records, nonterminal deployments, scoped completion URLs and rejection of child-operation deletion paths. This follows the [documented deletion contract](https://learn.microsoft.com/en-us/rest/api/resources/deployments/delete-at-subscription-scope?view=rest-resources-2025-04-01), but timing and response parity still require live measurement. Resource-group deletion itself remains synchronous locally.

The observer preserves the public ARM Host header and supplies the original HTTPS scheme to the local reverse-proxy target. This lets generated operation URLs retain the public authority without rewriting response bodies. Identity token acquisition is still outside the captured ARM lifecycle.
