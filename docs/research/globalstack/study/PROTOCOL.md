# Local configuration-fault experiment

## Question and scope

Which failures are visible to management acceptance, workflow status, arrival, exact-payload, and exclusive-delivery checks on the same local executions?

This is a purposive, first-party configuration-mutation experiment on two existing HTTP scenarios. It measures checker sensitivity on the enumerated mutations, not Azure fidelity, real-world fault frequency, or superiority over another emulator. The mutation implementation and test oracle share authorship. The previously retained eight-episode study remains a separate historical record.

## Fixed design

Before the first study run, retain this protocol and executable case definitions in Git. Each case starts with a fresh in-memory resource store, runtime, and loopback listeners. Execute connected, mutated, and restored episodes. Change one configuration relationship or field per mutation; duplicate actions/subscriptions add one relationship. Keep the original expected business payload unchanged. Close listeners and verify management and service cleanup for every case.

| Scenario | Mutation | Fault class |
|---|---|---|
| Enrichment | Read a different existing secret | Reference |
| Enrichment | Read a missing secret | Reference |
| Enrichment | Send to a wrong receiver path | Routing |
| Enrichment | Replace the course field | Payload |
| Enrichment | Add a second action to the intended receiver | Multiplicity |
| Enrichment | Add an action to an unintended receiver | Multiplicity |
| Event routing | Delete the delivery subscription | Routing |
| Event routing | Point the subscription at a wrong receiver | Routing |
| Event routing | Replace the event's course field | Payload |
| Event routing | Add a subscription to the intended receiver | Multiplicity |
| Event routing | Add a subscription to an unintended receiver | Multiplicity |
| Event routing | Replace string dataVersion with a number | Schema |

The expected application outcome is exactly one complete, type-correct payload at `/accepted` and no other delivery to the instrumented receiver. For these scenarios, extra delivery is a fault by specification. Applications allowing fan-out require a different oracle. Deliberately rejected service requests remain in the denominator. All mutations are specified as behavior-changing; equivalent or unexercised mutations must be reported rather than silently removed.

## Observations and ablations

Record the submitted management operations (method, path, response status), deployment/read-back state, trigger acceptance, workflow result, service-boundary status, expected payload, and **all** deliveries during the invocation. Do not discard traffic with an incorrect correlation identifier. Record only synthetic input and configuration, excluding generated service keys and authorization headers.

Evaluate five nested checks on each retained trace:

1. Management: accepted setup/mutation operations, successful deployment state, and readable workflow.
2. Workflow: management check and successful trigger/workflow status.
3. Arrival: workflow check and at least one correlated delivery at the intended path.
4. Exact-at-target: workflow check and exactly one correlated delivery at that path, with structural, type-sensitive JSON equality.
5. Exclusive outcome: exact-at-target and exactly one delivery in the complete observed invocation interval.

The fourth check matches the earlier paper's outcome predicate when combined with workflow success. It can accept an additional delivery elsewhere. The fifth checks a stronger application contract. Arrival is an intentionally weak baseline, not a claim about every existing integration-test system.

An episode interval starts immediately before the trigger request and ends after its response body has been consumed. The current runtime awaits synchronous downstream requests. This interval cannot establish eventual delivery or absence of delayed duplicates in Azure. One HTTP receiver request contains one event in this experiment; the equality check includes the full batch.

## Repetition and reporting

Run all 12 cases three times in fresh state, sequentially in the declared order. Each repetition has 36 episodes: 12 connected, 12 mutated, 12 restored. Repetitions test consistency of this local procedure; they are not independent workloads. Report 12 distinct configuration mutations separately from 36 repeated mutated episodes. Report count fractions, not population confidence intervals or statistical significance.

For check k, report rejected mutated episodes divided by all attempted mutated episodes, and rejected positive episodes divided by all attempted positive episodes. Also show each mutation separately so aggregate results cannot conceal differences. Harness errors are inconclusive and separate from checker rejection. Persist an attempt record even on assertion/setup/cleanup failure, exit nonzero if any attempt is inconclusive, and do not drop attempts from the report. Save baseline and restored results to expose faults in the harness or failed restoration.

No new model requests, live Azure resources, dependency downloads, or Docker images are needed. Use the existing local Node environment. Preserve the original validation snapshot and write the new study evidence separately. Record source revision, dirty status, content digests, host/runtime metadata, commands, and limitations. This protocol is locally committed before execution; it is not an externally preregistered study.
