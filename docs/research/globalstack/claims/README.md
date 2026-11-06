# Native claims-evidence case study

This is one authored refinement of the Terraform `claims-evidence-command-ring` bundle in the private `divine-ai-com/globalstack-verification` corpus. It adds an explicit behavioral contract to an existing infrastructure task. It is not an unchanged model output or an independent workload evaluation. The [measured contract](CONTRACT.md) is retained separately from the original prompt.

## What was executed

Three fresh local runtimes each ran native Terraform 1.17.1 with AzAPI 2.13.0. Each run checked formatting, original source assertions, provider initialization with the retained lockfile, validation, apply, resource/output read-back, and a no-change plan. All subscription changes went through Terraform. The bundle's declared integration entry point performed the behavior assertions; it fails if the local test context is absent.

Each run contained seven episodes: connected, wrong destination, restored, missing subscription, restored, duplicate subscription, restored. Across the three runs, all 12 positive episodes satisfied the contract and all nine faulty episodes were rejected with their expected witnesses. These are three distinct faults in one scenario. They are not 21 independent workloads. All Terraform applies and no-change plans succeeded, including the deliberately incorrect configurations. Native destruction succeeded, followed by 404 checks for the group, 11 listed management resources and four addressed data-plane surfaces. This is a dedicated research harness, not a rerun of the original seven-stage shipment runner.

The event path crosses Event Grid, a reference HTTP application, Blob reads, Queue writes and Table writes. The producer uploads the blob and explicitly publishes the event. There is no claim of automatic Blob event emission or emulated Functions execution. Service Bus, Event Hubs, Files and App Configuration are provisioned but not exercised in this path.

The earliest final-run timestamp is retained in the individual records. The runs used separate local runtimes and directories concurrently on the same host. They are repeated executions by the implementer, not independent reproduction or a performance benchmark. The minimum recorded free disk was 107.15 GiB.

## Retained evidence and verification

- `evidence/final-1.json`, `final-2.json`, `final-3.json`: complete corrected synthetic episode observations, command exit codes, clean source revisions and cleanup.
- `evidence/pre-fix-1.json`, `pre-fix-2.json`, `pre-fix-3.json`: earlier clean runs that exposed the duplicate Table insert defect, retained with their original provenance.
- `evidence/provenance.json`: exact corpus and product revisions, measured source digests and the four earlier development runs and three pre-fix clean runs. Development runs remain in the private corpus and are not pooled with the final sample.
- `evidence/provider.lock.hcl`: provider selection and checksums.
- `evidence/summary.json`, `measurements.tex`, `rows.tex`: generated from the final observations.

From the product root, run `node docs/research/globalstack/render-claims.mjs`. The verifier recomputes the payload digest, outcome, fault witnesses, boundary sequences, stage completion and cleanup. It does not execute Terraform or independently authenticate the captured trace. The top-level paper checksums detect subsequent artifact changes. Full source reproduction additionally requires access to the private corpus at the recorded revision; source publication is a remaining release task. Do not describe this case as a fully public reproducible artifact yet.

## Corrected defect and remaining semantic gaps

This is a local wiring study. It does not validate Azure delivery or storage fidelity.

1. Azure Event Grid uses at-least-once delivery, with possible duplicates and no ordering guarantee. The experiment's single-delivery predicate is restricted to the local synchronous interval and an intentionally single-subscription contract. A live workload needs idempotent business processing and a bounded asynchronous observation policy. See [Microsoft's delivery documentation](https://learn.microsoft.com/en-us/azure/event-grid/delivery-and-retry).
2. A custom Azure webhook must participate in subscription validation. This local reference receiver does not implement that handshake or cloud endpoint authentication. They must be added before any live comparison. See [Microsoft's endpoint-validation documentation](https://learn.microsoft.com/en-us/azure/event-grid/end-point-validation-event-grid-events-schema).
3. The pre-fix duplicate-subscription traces show two successful Table inserts for the same entity key. The router now rejects the second insert with HTTP 409 and preserves the original value and metadata. A focused regression covers identical and changed duplicate values and distinct keys. The final native traces show insert responses 201 then 409, and the worker verifies the existing ledger row after the conflict. It intentionally still writes two queue messages for this fault; business deduplication remains unimplemented. This correction follows the documented `EntityAlreadyExists` contract and is locally tested, not measured against live Azure. Pre-fix observations remain unchanged. See [Microsoft's Table error codes](https://learn.microsoft.com/en-us/rest/api/storageservices/table-service-error-codes).
4. Queue observation peeks up to 32 messages. These isolated seven-episode runs remain below that bound; the method is not a general queue audit. Ledger observation reads the expected key and required fields, not every entity or arbitrary external side effect.

These gaps are useful targets for differential testing. No live Azure execution, paid model call, claim of complete compatibility, or public release was made for this study.
