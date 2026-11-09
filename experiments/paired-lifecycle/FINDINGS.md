# First paired lifecycle findings

The initial Azure comparison confirms that native deployment success alone does not establish protocol equivalence. After two targeted corrections, the unchanged Terraform configuration completed all 16 recorded stages on both GlobalStack and Azure. Selected protocol differences remain visible.

[Stage-by-stage snapshots](SNAPSHOTS.md) show the lifecycle first, followed by both targets' command outcomes, API sequences and remaining differences. The downloadable HTML includes expandable recorded request/response fields. Capture boundaries and the general scope of each fix are stated alongside the comparison.

## Scope

One empty resource-group configuration uses Terraform 1.17.1 and AzAPI 2.13.0 in East US. Source hashes, provider lockfile and the tool image match across the two targets. Deployment identity and credentials are external runner inputs. This is a first-party pilot on one host, not an independent reproduction or a Storage/event-flow evaluation.

The 16 stages include version, format, initialization, validation, create plan/apply, stable plan, refresh, update plan/apply, drift plan/repair, state removal, import, imported-state plan and destroy. The direct tag-drift and read-back probes are retained separately from the native provider trace. A plan exit code of 2 is expected when a change is present.

## Observations and corrections

| Observation | Initial evidence | Correction or remaining work |
|---|---|---|
| Resource-group tag PATCH | GlobalStack returned 404; Azure returned 200 and Terraform detected and repaired the injected drift | Added PATCH of an existing group, preserving omitted fields; regression and corrected native pair pass |
| Internal diagnostic field | GlobalStack returned an extra `globalstack` object in resource-group responses; Azure did not | Removed the field from resource-group GET/PUT/PATCH/list responses while retaining internal store diagnostics; other resource families require separate review |
| Native deletion polling | Azure returned 202 with a signed operation URL; the first observer denied its GET, causing native destruction to report failure although the group was gone | Observer now permits only read-only operation URLs granted by an allowed 202 response; signed values are removed from evidence; corrected native Azure destroy passes |
| Deletion protocol | Corrected GlobalStack returns 200 synchronously; Azure returns 202 and performs one additional polling GET | Retained as a lifecycle interaction difference. This pilot does not establish equivalent asynchronous deletion semantics |
| Response headers | Content-Type formatting and request/correlation-header presence differ; Azure also supplies selected rate-limit headers | Retained for protocol classification; not erased from the comparison |
| Missing-resource response | Both return the same not-found error code/status, but message text and the presence of `details` differ | Retained as an error-envelope difference |
| Provider import API version | The pinned native provider's import selected API version 2025-04-01 for later operations, although the declared fixture uses 2021-04-01 | Preserve observed API versions. A configuration declaration alone does not establish that every lifecycle request uses that version |

## Retained attempts

- `evidence/pre-fix.json`: the frozen initial pair at `1a862a1`. GlobalStack stopped at PATCH; Azure completed the functional stages but native destruction failed because of the observer. Both groups were confirmed absent. This is not a passing pair.
- `evidence/corrected.json`: the frozen pair at `356645f`. All 16 stages passed on both targets, both native destroys passed, both groups were confirmed absent, and temporary private files were removed. The observer captured 20 local and 21 Azure exchanges. All ten declared management phases have captured responses. The read-update, PATCH and repaired-state probe bodies agree.
- `evidence/crash-attempt.json` and `evidence/recovery.json`: a separate experiment at `24ff83a` terminates the controller with SIGKILL after native Azure creation. The watchdog deletes the owned group; independent verification confirms absence without another deletion, and removes remaining private files. The interrupted attempt is not pooled with successful lifecycle runs.

The corrected comparison pairs 20 exchanges, retains one unmatched Azure deletion-poll request and reports differences in all 20 paired exchanges, principally header differences. This is not a 0% or 100% compatibility result. Lifecycle success, body agreement, header differences, asynchronous behavior and capture coverage have separate meanings.

The recorded run times are UTC; these experiments occurred on 7 November 2026 in the operator's Asia/Dubai timezone. The original failed pair remains available after correction. Public records remove account identifiers and signed polling material; the publication metadata records original report digests and the sanitization implementation digest.

## Costs and next gates

Only empty resource groups were provisioned. No compute, Storage, messaging namespace, database or monitoring resource was created. The USD 100 operator ceiling remains the upper limit for the broader pilot, not a claim that this amount was spent. Actual billing is reconciled separately because cost reporting is delayed.

Before billable expansion, add the scoped Storage resource manifest and cost estimate, broaden header capture safely, and implement/validate the asynchronous lifecycle contracts needed by that scenario. The broader plan also requires authentication-negative cases, data-plane SDK behavior, cross-service event flow, retries and idempotency, and two selected cases per platform. None of those are counted as completed by this empty-group pilot.
