# Claims evidence behavior, revision 2

Source: `verified/2c1d6f0e-3640-4fc2-a41a-5d2b8c0d2f01/Pr91301` at corpus revision `99d1b74cfbfd73a1ff9b0b248d892fd9a6d39e23`. The original prompt, implementation, tests, and historical reports remain unchanged there. This revision adds explicit behavior; it must not be used to rescore the original prompt retroactively.

## Added requirement

An application producer uploads one synthetic claims-evidence JSON object into the deployed private container and explicitly publishes a `Claims.EvidenceSubmitted` Event Grid event referring to it. A topic-scoped subscription, created by Terraform, sends that event to a configurable reference-worker URL. The worker reads the referenced blob over the storage HTTP API, adds one classification message to the deployed queue, and records one ledger entity keyed by the correlation ID in the deployed table. Both records must preserve the claim ID, blob name, correlation ID, and SHA-256 of the uploaded bytes.

The expected delivery contract is one correlated event at the intended worker endpoint and no extra delivery at the instrumented receiver during the local synchronous publish interval. The original eight outputs remain, with `ClaimsAuditSubscriptionIds` added. Terraform must accept `claims_worker_url` and `claims_subscription_count`; the latter defaults to one and exists to exercise zero- and two-subscription controls. Production workloads allowing duplicate delivery or fan-out need a different application contract and deduplication policy.

The reference worker is test application code, not an emulated Function App. Blob upload does not automatically emit the event in this experiment. Service Bus, Event Hubs, Files, and App Configuration remain provisioned infrastructure; this path does not establish their data-plane behavior. Authentication uses generated local service keys and a synthetic development identity, not real Azure credentials or RBAC.

## Evaluation before broader rollout

Run native Terraform formatting/validation, source unit assertions, apply, resource/output read-back, and a no-change plan. Execute connected, wrong-destination, restored, missing-subscription, restored, duplicate-subscription, and restored episodes. All subscription changes must be applied through Terraform, not inserted directly by the integration test. Preserve failed attempts and stage logs. Assert the fault-specific witness, rather than counting any incidental exception as a detected fault.

Destroy through Terraform. Check the group and all workload management resources disappear; check the addressed Blob, Queue, Table, and Event Grid endpoints reject access after deletion. Stop test listeners even on failure. Keep raw state and local key material only in a disposable run directory. Archive synthetic observations and source/toolchain identifiers separately. Maintain at least 40 GiB free.

This is an authored reference refinement, not an unmodified model result, externally authored workload, independent reproduction, or live Azure parity experiment. Do not pool the new results with the historical seven-stage pass reports.
