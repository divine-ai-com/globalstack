# Terraform lifecycle snapshots

Same HCL and provider lockfile, two targets: GlobalStack and Azure. This corrected empty-resource-group pilot passed all 16 command stages. The four direct probes and final cleanup are separate steps. Successful completion does not imply identical API behavior.

## Lifecycle before comparison

Check absence → version and format → initialize → validate → plan and create → check stability → refresh → plan and apply update → verify update → inject drift → detect and repair drift → verify repair → remove state ownership → import → check imported state → destroy → verify cleanup.

This is the lifecycle exercised by this experiment, not an exhaustive lifecycle for every Terraform resource.

## Recorded comparison

Exit 2 is expected for plans with changes. In this recording Azure deletion polling returned **GET 200** with an empty body. Both targets ended with confirmed absence.

| Step | GlobalStack | Azure |
| --- | --- | --- |
| 1. [Check the group does not exist](#preflight) | GET 404 | GET 404 |
| 2. [Check Terraform version](#version) | Exit 0 (expected 0); 12035 ms. No ARM exchange captured. | Exit 0 (expected 0); 515 ms. No ARM exchange captured. |
| 3. [Check configuration format](#format) | Exit 0 (expected 0); 677 ms. No ARM exchange captured. | Exit 0 (expected 0); 467 ms. No ARM exchange captured. |
| 4. [Initialize the working directory](#init) | Exit 0 (expected 0); 18625 ms. No ARM exchange captured. | Exit 0 (expected 0); 13582 ms. No ARM exchange captured. |
| 5. [Validate configuration](#validate) | Exit 0 (expected 0); 4299 ms. No ARM exchange captured. | Exit 0 (expected 0); 3974 ms. No ARM exchange captured. |
| 6. [Plan creation](#plan-create) | Exit 2 (expected 2); 9091 ms. No ARM exchange captured. | Exit 2 (expected 2); 4184 ms. No ARM exchange captured. |
| 7. [Create the group](#apply-create) | Exit 0 (expected 0); 13802 ms. GET 404 → PUT 201 → GET 200. | Exit 0 (expected 0); 10180 ms. GET 404 → PUT 201 → GET 200. |
| 8. [Check for an empty plan](#plan-stable) | Exit 0 (expected 0); 12788 ms. GET 200. | Exit 0 (expected 0); 3967 ms. GET 200. |
| 9. [Refresh Terraform state](#refresh) | Exit 0 (expected 0); 22802 ms. GET 200. | Exit 0 (expected 0); 5118 ms. GET 200. |
| 10. [Plan a tag update](#plan-update) | Exit 2 (expected 2); 11488 ms. GET 200. | Exit 2 (expected 2); 3704 ms. GET 200. |
| 11. [Apply the tag update](#apply-update) | Exit 0 (expected 0); 15653 ms. GET 200 → PUT 200 → GET 200. | Exit 0 (expected 0); 5807 ms. GET 200 → PUT 200 → GET 200. |
| 12. [Verify the update independently](#read-update) | GET 200 | GET 200 |
| 13. [Introduce external drift](#inject-drift) | PATCH 200 | PATCH 200 |
| 14. [Detect the external drift](#plan-drift) | Exit 2 (expected 2); 13053 ms. GET 200. | Exit 2 (expected 2); 4035 ms. GET 200. |
| 15. [Repair the drift](#apply-repair) | Exit 0 (expected 0); 11577 ms. GET 200 → PUT 200 → GET 200. | Exit 0 (expected 0); 7003 ms. GET 200 → PUT 200 → GET 200. |
| 16. [Verify the repair independently](#read-repair) | GET 200 | GET 200 |
| 17. [Remove Terraform ownership](#state-remove) | Exit 0 (expected 0); 7001 ms. No ARM exchange captured. | Exit 0 (expected 0); 6144 ms. No ARM exchange captured. |
| 18. [Import the existing group](#import) | Exit 0 (expected 0); 3312 ms. GET 200 → GET 200. | Exit 0 (expected 0); 4164 ms. GET 200 → GET 200. |
| 19. [Check the imported state](#plan-imported) | Exit 0 (expected 0); 3472 ms. GET 200 → GET 200. | Exit 0 (expected 0); 4612 ms. GET 200 → GET 200. |
| 20. [Destroy the group](#destroy) | Exit 0 (expected 0); 4587 ms. GET 200 → GET 200 → DELETE 200. | Exit 0 (expected 0); 21355 ms. GET 200 → GET 200 → DELETE 202 → GET 200. |
| 21. [Confirm absence and remove private files](#cleanup) | Native destroy: true; absent: true; private files removed: true. | Native destroy: true; absent: true; private files removed: true. |

[Open the self-contained HTML](SNAPSHOTS.html) after downloading it for side-by-side expandable records. [Machine-readable snapshots](evidence/stage-snapshots.json) preserve all 41 native exchanges and eight direct-probe responses from [the original corrected record](evidence/corrected.json). The JSON is derived evidence, not a new run.

## Capture boundaries

- These snapshots reproduce the published sanitized record. Account identifiers, signed polling material and credentials are redacted; selected headers and parsed JSON bodies are retained, not all wire bytes.
- Command descriptions and step ordering come from the frozen runner. The original record has exit codes and durations but no command arguments or per-command start/end timestamps. ARM exchanges do have recorded UTC timestamps.
- No per-stage Terraform state files, saved plan JSON, console screenshots or full command logs are included in this published evidence. A stage without an ARM exchange is marked as such, without inventing a remote-state snapshot.
- Direct probes retain response status/body but not request headers, request bodies or timestamps. Cleanup retains result flags rather than a complete verification exchange.
- The targets ran sequentially on one host. Command durations include container/provider overhead and are not a performance comparison. Identity token acquisition and provider downloads are outside ARM capture.
- This is one Terraform/AzAPI empty-group lifecycle. It does not establish other providers, other IaC tools, invalid-input behavior, data-plane behavior or cross-service event delivery.

## Scope of the fixes

| Fix | Shared scope | What is checked | Remaining boundary |
| --- | --- | --- | --- |
| Resource-group PATCH | Shared ARM resource-group route, for the requested subscription and group. No pilot name or tag is special-cased. | Valid tag updates, replacement of the supplied tag map, preservation of omitted fields and 404 for a missing group. Local regression also checks distinct group names and subscriptions. | No claim of complete validation for malformed payloads, location changes, other resource types or every API version. |
| Public resource-group responses | Shared GET, PUT, PATCH and list responses omit the internal globalstack field. | Applies to resource-group callers regardless of which IaC tool sends the request. Local regression checks response shape and isolation. | Other resource families have not received this same audit. |
| Deletion polling observer | Experiment transport, not the GlobalStack service implementation. It accepts only scoped read-only polling URLs granted by allowed upstream 202 responses. | Allows the native Azure provider to complete this deletion and preserves the extra polling exchange. | Still scoped to this empty-group pilot. It does not implement asynchronous deletion in GlobalStack or authorize arbitrary service operations. |

The product fixes apply to the resource-group handler shared by clients. Passing this test does not prove every other use case works. The observer fix is a harness correction, while GlobalStack's synchronous deletion remains a product compatibility gap.

## Stage details

<a id="preflight"></a>

### 1. Check the group does not exist

Refuse to modify an existing group. This is a runner probe, outside Terraform.

Command or action from the frozen runner:

```text
Direct GET of the generated resource-group path
```

- GlobalStack: GET 404
- Azure: GET 404
- Comparison: Differing fields: /body/error/message, /body/error/details.
- Exact recorded fields: [snapshot 1](SNAPSHOTS.html#preflight) or `stages[0]` in the JSON.

<a id="version"></a>

### 2. Check Terraform version

Check the pinned Terraform 1.17.1 executable.

Command or action from the frozen runner:

```text
terraform version -json
```

- GlobalStack: Exit 0 (expected 0); 12035 ms. No ARM exchange captured.
- Azure: Exit 0 (expected 0); 515 ms. No ARM exchange captured.
- Comparison: Command outcomes available; no captured ARM exchange to compare.
- Exact recorded fields: [snapshot 2](SNAPSHOTS.html#version) or `stages[1]` in the JSON.

<a id="format"></a>

### 3. Check configuration format

Check HCL formatting without changing the source.

Command or action from the frozen runner:

```text
terraform fmt -check
```

- GlobalStack: Exit 0 (expected 0); 677 ms. No ARM exchange captured.
- Azure: Exit 0 (expected 0); 467 ms. No ARM exchange captured.
- Comparison: Command outcomes available; no captured ARM exchange to compare.
- Exact recorded fields: [snapshot 3](SNAPSHOTS.html#format) or `stages[2]` in the JSON.

<a id="init"></a>

### 4. Initialize the working directory

Install the pinned provider and initialize Terraform. Provider downloads are outside ARM capture.

Command or action from the frozen runner:

```text
terraform init -input=false -lockfile=readonly -no-color
```

- GlobalStack: Exit 0 (expected 0); 18625 ms. No ARM exchange captured.
- Azure: Exit 0 (expected 0); 13582 ms. No ARM exchange captured.
- Comparison: Command outcomes available; no captured ARM exchange to compare.
- Exact recorded fields: [snapshot 4](SNAPSHOTS.html#init) or `stages[3]` in the JSON.

<a id="validate"></a>

### 5. Validate configuration

Validate the configuration using the installed provider.

Command or action from the frozen runner:

```text
terraform validate -no-color
```

- GlobalStack: Exit 0 (expected 0); 4299 ms. No ARM exchange captured.
- Azure: Exit 0 (expected 0); 3974 ms. No ARM exchange captured.
- Comparison: Command outcomes available; no captured ARM exchange to compare.
- Exact recorded fields: [snapshot 5](SNAPSHOTS.html#validate) or `stages[4]` in the JSON.

<a id="plan-create"></a>

### 6. Plan creation

Plan the new group with revision=one. Expected exit 2 means changes are planned.

Command or action from the frozen runner:

```text
terraform plan -input=false -detailed-exitcode -no-color
```

- GlobalStack: Exit 2 (expected 2); 9091 ms. No ARM exchange captured.
- Azure: Exit 2 (expected 2); 4184 ms. No ARM exchange captured.
- Comparison: Command outcomes available; no captured ARM exchange to compare.
- Exact recorded fields: [snapshot 6](SNAPSHOTS.html#plan-create) or `stages[5]` in the JSON.

<a id="apply-create"></a>

### 7. Create the group

Create and read the group. Apply computes its own plan; this run did not apply a saved plan file.

Command or action from the frozen runner:

```text
terraform apply -auto-approve -input=false -no-color
```

- GlobalStack: Exit 0 (expected 0); 13802 ms. GET 404 → PUT 201 → GET 200.
- Azure: Exit 0 (expected 0); 10180 ms. GET 404 → PUT 201 → GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id, /response/body/error/message, /response/body/error/details, /response/headers/x-ms-ratelimit-remaining-subscription-writes.
- Exact recorded fields: [snapshot 7](SNAPSHOTS.html#apply-create) or `stages[6]` in the JSON.

<a id="plan-stable"></a>

### 8. Check for an empty plan

Read the group and check that no change is needed.

Command or action from the frozen runner:

```text
terraform plan -input=false -detailed-exitcode -no-color
```

- GlobalStack: Exit 0 (expected 0); 12788 ms. GET 200.
- Azure: Exit 0 (expected 0); 3967 ms. GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id.
- Exact recorded fields: [snapshot 8](SNAPSHOTS.html#plan-stable) or `stages[7]` in the JSON.

<a id="refresh"></a>

### 9. Refresh Terraform state

Refresh state from the remote group without requesting a configuration change.

Command or action from the frozen runner:

```text
terraform apply -refresh-only -auto-approve -input=false -no-color
```

- GlobalStack: Exit 0 (expected 0); 22802 ms. GET 200.
- Azure: Exit 0 (expected 0); 5118 ms. GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id.
- Exact recorded fields: [snapshot 9](SNAPSHOTS.html#refresh) or `stages[8]` in the JSON.

<a id="plan-update"></a>

### 10. Plan a tag update

The runner changes the external revision input from one to two. HCL source remains unchanged.

Command or action from the frozen runner:

```text
terraform plan -input=false -detailed-exitcode -no-color
```

- GlobalStack: Exit 2 (expected 2); 11488 ms. GET 200.
- Azure: Exit 2 (expected 2); 3704 ms. GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id.
- Exact recorded fields: [snapshot 10](SNAPSHOTS.html#plan-update) or `stages[9]` in the JSON.

<a id="apply-update"></a>

### 11. Apply the tag update

Update the desired revision tag to two and read back the group.

Command or action from the frozen runner:

```text
terraform apply -auto-approve -input=false -no-color
```

- GlobalStack: Exit 0 (expected 0); 15653 ms. GET 200 → PUT 200 → GET 200.
- Azure: Exit 0 (expected 0); 5807 ms. GET 200 → PUT 200 → GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id, /response/headers/x-ms-ratelimit-remaining-subscription-writes.
- Exact recorded fields: [snapshot 11](SNAPSHOTS.html#apply-update) or `stages[10]` in the JSON.

<a id="read-update"></a>

### 12. Verify the update independently

Check revision=two outside the native provider trace.

Command or action from the frozen runner:

```text
Direct GET of the resource-group path
```

- GlobalStack: GET 200
- Azure: GET 200
- Comparison: Retained status/body fields agree.
- Exact recorded fields: [snapshot 12](SNAPSHOTS.html#read-update) or `stages[11]` in the JSON.

<a id="inject-drift"></a>

### 13. Introduce external drift

Intentionally change the remote tag without changing Terraform inputs. This is a test action, not a Terraform deployment step.

Command or action from the frozen runner:

```text
Direct PATCH with existing tags and revision=external
```

- GlobalStack: PATCH 200
- Azure: PATCH 200
- Comparison: Retained status/body fields agree.
- Exact recorded fields: [snapshot 13](SNAPSHOTS.html#inject-drift) or `stages[12]` in the JSON.

<a id="plan-drift"></a>

### 14. Detect the external drift

Read revision=external and plan to restore the desired revision=two.

Command or action from the frozen runner:

```text
terraform plan -input=false -detailed-exitcode -no-color
```

- GlobalStack: Exit 2 (expected 2); 13053 ms. GET 200.
- Azure: Exit 2 (expected 2); 4035 ms. GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id.
- Exact recorded fields: [snapshot 14](SNAPSHOTS.html#plan-drift) or `stages[13]` in the JSON.

<a id="apply-repair"></a>

### 15. Repair the drift

Restore the desired tag and read back the group.

Command or action from the frozen runner:

```text
terraform apply -auto-approve -input=false -no-color
```

- GlobalStack: Exit 0 (expected 0); 11577 ms. GET 200 → PUT 200 → GET 200.
- Azure: Exit 0 (expected 0); 7003 ms. GET 200 → PUT 200 → GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id, /response/headers/x-ms-ratelimit-remaining-subscription-writes.
- Exact recorded fields: [snapshot 15](SNAPSHOTS.html#apply-repair) or `stages[14]` in the JSON.

<a id="read-repair"></a>

### 16. Verify the repair independently

Check revision=two outside the native provider trace.

Command or action from the frozen runner:

```text
Direct GET of the resource-group path
```

- GlobalStack: GET 200
- Azure: GET 200
- Comparison: Retained status/body fields agree.
- Exact recorded fields: [snapshot 16](SNAPSHOTS.html#read-repair) or `stages[15]` in the JSON.

<a id="state-remove"></a>

### 17. Remove Terraform ownership

Remove the resource from Terraform state without deleting the remote group.

Command or action from the frozen runner:

```text
terraform state rm azapi_resource.group
```

- GlobalStack: Exit 0 (expected 0); 7001 ms. No ARM exchange captured.
- Azure: Exit 0 (expected 0); 6144 ms. No ARM exchange captured.
- Comparison: Command outcomes available; no captured ARM exchange to compare.
- Exact recorded fields: [snapshot 17](SNAPSHOTS.html#state-remove) or `stages[16]` in the JSON.

<a id="import"></a>

### 18. Import the existing group

Reattach the existing group to Terraform state. The recorded provider requests use API version 2025-04-01.

Command or action from the frozen runner:

```text
terraform import -input=false -no-color azapi_resource.group /subscriptions/<subscription>/resourcegroups/<group>
```

- GlobalStack: Exit 0 (expected 0); 3312 ms. GET 200 → GET 200.
- Azure: Exit 0 (expected 0); 4164 ms. GET 200 → GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id.
- Exact recorded fields: [snapshot 18](SNAPSHOTS.html#import) or `stages[17]` in the JSON.

<a id="plan-imported"></a>

### 19. Check the imported state

Check that no change is needed after import. Retain both observed API versions.

Command or action from the frozen runner:

```text
terraform plan -input=false -detailed-exitcode -no-color
```

- GlobalStack: Exit 0 (expected 0); 3472 ms. GET 200 → GET 200.
- Azure: Exit 0 (expected 0); 4612 ms. GET 200 → GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id.
- Exact recorded fields: [snapshot 19](SNAPSHOTS.html#plan-imported) or `stages[18]` in the JSON.

<a id="destroy"></a>

### 20. Destroy the group

Read and delete the group. Preserve the different deletion responses and Azure polling request.

Command or action from the frozen runner:

```text
terraform destroy -auto-approve -input=false -no-color
```

- GlobalStack: Exit 0 (expected 0); 4587 ms. GET 200 → GET 200 → DELETE 200.
- Azure: Exit 0 (expected 0); 21355 ms. GET 200 → GET 200 → DELETE 202 → GET 200.
- Comparison: Differing fields: /response/headers/content-type, /response/headers/x-ms-request-id, /response/headers/x-ms-correlation-request-id, /status, /response/headers/location, /response/headers/retry-after, /response/body. Unmatched azure exchange: destroy GET /subscriptions/<subscription>/operationresults/<operation>?api-version=2025-04-01&t=<redacted>&c=<redacted>&s=<redacted>&h=<redacted>.
- Exact recorded fields: [snapshot 20](SNAPSHOTS.html#destroy) or `stages[19]` in the JSON.

<a id="cleanup"></a>

### 21. Confirm absence and remove private files

The cleanup record reports confirmed absence and removal of credentials, certificates and state. It does not contain the full verification HTTP exchange.

Command or action from the frozen runner:

```text
Independent cleanup verification and private-file removal
```

- GlobalStack: Native destroy: true; absent: true; private files removed: true.
- Azure: Native destroy: true; absent: true; private files removed: true.
- Comparison: Both report successful cleanup; raw verification traffic is not retained.
- Exact recorded fields: [snapshot 21](SNAPSHOTS.html#cleanup) or `stages[20]` in the JSON.

## Provenance

- Run source: [356645fbb153c8a1850eac1109ff4b35785b190d](https://github.com/divine-ai-com/globalstack/tree/356645fbb153c8a1850eac1109ff4b35785b190d/experiments/paired-lifecycle).
- UTC interval: 2026-11-06T20:43:17.677Z to 2026-11-06T20:47:50.903Z. This was 7 November 2026 in Asia/Dubai.
- SHA-256 of published corrected.json: `b9f7ca402afc68746b7a51cea1e414ac6f6da47aff5df5ad4ed31e0bf7039dfb`.
- HCL, lockfile and tool image digests are retained in the JSON. Account-specific values remain redacted.
- Regenerate with `node experiments/paired-lifecycle/render-snapshots.mjs`; verify without writing with `--check`.
