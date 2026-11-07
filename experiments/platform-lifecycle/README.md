# Platform lifecycle captures

This experiment extends the resource-group lifecycle to all nine [registered Azure platforms](../../packages/platform-registry/src/index.mjs). Each tool uses its native program and an explicit lifecycle described in [the plan](PLAN.md). The frozen local matrix passed all nine implementations: 154 command stages and 137 native ARM exchanges. [Per-stage snapshots](SNAPSHOTS.md) include an [offline HTML comparison](SNAPSHOTS.html) and retained JSON. All nine now also have [recorded native Azure pairs](LIVE.md). Portal screenshots remain pending, and resource-group success does not establish application compatibility.

Run one local platform with its existing pinned validation image:

```bash
node experiments/platform-lifecycle/run.mjs --platform=azure-ansible-yaml --target=local
```

Results go into a unique, private `reports/platform-lifecycle` directory. The result includes command arguments, exit codes, UTC intervals, bounded sanitized stdout/stderr, native HTTP exchanges, direct probes, cleanup outcomes, source hashes and tool image identity. Package/plugin caches are shared under `reports/platform-lifecycle-cache`; credentials and native state are per-run and removed after verified absence. Keep at least 40 GiB free.

The external CLI token adapter supplies already obtained identity context to clients without changing their IaC source. It does not test Entra authentication. The ARM observer forwards bytes without rewriting responses. It restricts writes to the generated group and, for Bicep/ARM, the exact frozen deployment template and parameter sets. Read-only inventory for that group and required subscription discovery are permitted. Request and response capture still uses selected headers.

The Ansible runner uses `azure.azcollection` and CLI credentials. CLI REST uses real `az rest` commands. Bicep compiles with the Bicep CLI and submits the compiled template through `az rest`; ARM JSON submits its template through the same API. Neither is presented as an `az deployment ...` command capture. HCL uses the AzAPI provider, not AzureRM. Pulumi uses its native Azure provider. Tool families without Terraform-style state/import do not receive fabricated state stages.

## Portal capture gate

The default `--portal=required` mode requires a signed-in, controllable Azure Portal browser before starting an Azure target. For independent terminal/API evidence, an operator can explicitly select `--portal=deferred`; that mode records pending Portal checkpoints and never reports Portal evidence as complete. It does not waive the requirement for the requested Portal captures. `PAIRED_PORTAL_CAPTURE_READY=1` is an operator assertion, not proof of browser readiness. Live execution also requires the explicit authorized USD ceiling, the signed-in subscription ID and the private Azure CLI configuration directory. The broader pilot ceiling remains USD 100 total.

After creation and update, the runner writes a private `portal-request.json` and waits at most two minutes for the corresponding `portal-created.json` or `portal-updated.json`. Capture the actual portal resource view during that window. The receipt must contain `source: "Azure Portal"`, the requested phase and resource ID, a UTC `capturedAt` after the request, a basename-only PNG `file`, its `sha256`, and a description of any privacy masks. Do not fabricate receipts or substitute report screenshots. Files and receipts remain private until publication review.

Missing screenshots fail the run and trigger cleanup. The independent watchdog stops the owned container and removes the owned empty group if the controller exits or exceeds its deadline. Bicep/ARM cleanup verifies the deployment parameters and waits up to two minutes for a terminal deployment state before removing the group and owned deployment record. If the deployment remains active, cleanup fails and preserves the recovery context to avoid racing a resource creation. Cleanup failure preserves the private recovery context and blocks subsequent targets. Host failure still requires external recovery.

## Newly observed local gaps

Ansible's resource-group reconciliation reads the group's generic resource inventory and uses HEAD existence checks. The older Terraform pilot did not exercise those requests. The local implementation now handles unfiltered inventory reads and resource-group HEAD. OData inventory filters, expansions and limits return an explicit unsupported response rather than silently returning the wrong list. These corrections are based on the [Azure existence contract](https://learn.microsoft.com/en-us/rest/api/resources/resource-groups/check-existence?view=rest-resources-2021-04-01) and [resource inventory contract](https://learn.microsoft.com/en-us/rest/api/resources/resources/list-by-resource-group?view=rest-resources-2021-04-01); the nine live pairs now exercise this shared resource-group surface.

Bicep also exposed a missing deployment-history DELETE operation. The shared subscription and resource-group handlers now delete only the deployment record, return a completion-poll URL, and leave deployed resources intact. Tests cover missing records, nonterminal deployments, scoped completion URLs and rejection of child-operation deletion paths. This follows the [documented deletion contract](https://learn.microsoft.com/en-us/rest/api/resources/deployments/delete-at-subscription-scope?view=rest-resources-2025-04-01), with timing and response differences retained in the live comparisons. Resource-group deletion itself remains synchronous locally.

The observer preserves the public ARM Host header and supplies the original HTTPS scheme to the local reverse-proxy target. This lets generated operation URLs retain the public authority without rewriting response bodies. Identity token acquisition is still outside the captured ARM lifecycle.

## Evidence and reproducibility

The final local captures come from clean revision `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. The [index](evidence/index.json) records their SHA-256 digests; the files are byte-for-byte copies of sanitized runner output. Subsequent cleanup hardening is covered by separate regressions and does not change these historical records.

Five failed development attempts are retained in a [separate index](evidence/attempts/index.json), with causes and dirty-source flags. They are not pooled with the final passes. Some ran with uncommitted changes; the revision field alone cannot reconstruct those attempts.

The fixtures and validation image IDs are recorded. TypeScript dependencies have a lockfile; Python pins the principal SDK versions but not every transitive dependency. These results therefore do not establish bit-for-bit reproducibility of every installed package. Native images must be available locally before reproduction. CI validates evidence completeness, fixture hashes and deterministic reports; it does not rerun this nine-platform matrix or access Azure.

The shared fixes cover resource-group HEAD, unfiltered resource inventory, public resource-group responses and deployment-history deletion. They are not conditional on this pilot's names or tags. Regression coverage across arbitrary names and configured subscriptions supports that scope. Other Azure services, OData inventory queries, asynchronous resource-group deletion and application event paths require separate validation.

## Live terminal walkthroughs

`walkthrough.mjs` records a browser view of actual command output and API observations while `run.mjs` executes. This is a terminal walkthrough, not an Azure Portal recording. Output is redacted before capture, including credentials split across process chunks. The output includes a WebM video, timestamped event stream, offline HTML replay, final terminal screenshot, video/event hashes and the normal result JSON. Native command stdout/stderr, direct probes and the observer remain distinct.

Set `PAIRED_PLAYWRIGHT_MODULE` to an installed `playwright-core/index.mjs` and, if required, `PAIRED_CHROMIUM_EXECUTABLE` to the local Chromium executable. Browser and Playwright versions are recorded. The server binds only to loopback and serves only the sanitized live event stream. It does not load Portal cookies or sign in to Azure.

```bash
node experiments/platform-lifecycle/walkthrough.mjs --platform=azure-terraform-hcl --target=both --portal=deferred
node experiments/platform-lifecycle/compare.mjs /absolute/run/result.json /absolute/run/comparison.json
```

Live runs still require the authorized USD ceiling, signed-in subscription and private CLI directory. Video capture does not add permission to provision other resource types. Deferring screenshots changes only the evidence schedule; cleanup and storage protections remain active. A native lifecycle pass, a selected-field comparison and completion of Portal evidence are separate results.
