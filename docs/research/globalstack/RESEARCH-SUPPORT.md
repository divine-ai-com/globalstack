# GlobalStack research collaboration brief

Status: internal technical draft, 6 November 2026. Authors and affiliations pending. This document has not been sent to any organization. It proposes work and support, not an existing partnership or funding commitment.

## Research problem and contribution

An infrastructure deployment can succeed while the intended application event fails to reach its destination or produces an unwanted additional effect. GlobalStack provides selected local Azure management and service interfaces for testing those relationships. The research contribution is a scoped implementation and an auditable evaluation method combining native deployment, correlated behavior, deliberate faults, restoration and cleanup.

The paper investigates what each observation layer establishes. It does not claim a new general testing theory, comprehensive Azure compatibility, production isolation or superiority to other emulators. A stronger submission depends on independent evidence and explicit service-level disagreements, not a higher claimed coverage percentage.

## Evidence available now

| Evidence | Result | Limit |
|---|---|---|
| Native client matrix | Nine reference configurations completed seven stages and cleanup | One sample per platform; historical snapshot |
| Controlled checker comparison | 12 chosen faults across two flows, three repetitions, 108 episodes | First-party scenarios sharing one workflow engine |
| Checker distinction | Management rejected 0/12 faults; workflow 2/12; arrival 5/12; exact intended outcome 10/12; exclusion of extra deliveries 12/12 | Sensitivity to selected faults, not population accuracy |
| Refined native case | One Terraform claims scenario; three fresh runs, 12 passing positives and nine expected fault rejections; cleanup passed | One authored refinement, no external replication or live Azure pair |
| Repaired discrepancy | Duplicate Table inserts now return 409 and preserve the original entity; final native reruns pass | Documentation-grounded correction with local regression evidence; not a live-Azure comparison |

The [paper](paper.pdf), [fault-study protocol](study/PROTOCOL.md), [native case record](claims/README.md), and [readiness checklist](study/READINESS.md) provide the detailed scope. Each experiment retains its own denominator and revision. The native harness and refined scenario are included in this repository. Private corpus audit counts are excluded from the paper results because the broader corpus has not been released. No new model-generation results are claimed.

## Proposed questions for a supported study

1. Which deployment, event-routing and business-state disagreements appear when the same declared contract is executed locally and on Azure?
2. Which discrepancies would management read-back miss, and which are exposed by correlated event and side-effect observations?
3. Can an independent team reproduce the local results using only the released artifact and documented prerequisites?

Report agreements, disagreements, unsupported operations, infrastructure failures and inconclusive observations separately. Use counts with denominators per scenario and operation. Do not turn a small purposive sample into a service-wide fidelity percentage.

## Work packages and acceptance criteria

| Work package | Deliverable and completion criterion |
|---|---|
| Freeze the artifact | Release the reviewed, self-contained source and evidence under a fixed version, with source digests, dependencies and reproduction instructions. An external reader can obtain every required file. |
| Independent scenario selection | A collaborator selects three architecturally different scenarios before execution, using documented inclusion rules. Pin source, license, API versions and business contracts; retain exclusions and unsupported cases. Existing claims is a candidate, not a predetermined independent selection. |
| Local fidelity preparation | Extend the corrected Table conflict tests into paired checks, implement worker deduplication and webhook validation, and define endpoint authentication and bounded observation. Preserve pre-fix evidence. |
| Paired pilot | Proposed minimum: three scenarios × two targets × three repetitions = 18 lifecycle executions, forming nine local/Azure pairs. Each lifecycle contains connected, declared fault and restored episodes. Freeze the exact fault list and resulting episode budget before execution. This count is a proposal, not a completed result. |
| Independent reproduction | A person outside implementation runs the frozen local artifact on another host. Retain versions, instructions needed beyond the README, failures, corrections and final outcomes. |
| Research assessment | Review novelty, related work, claims, formulas, all deviations and threats to validity; finalize authorship and an appropriate submission category. No acceptance prediction. |

For paired execution, keep the business contract common while explicitly documenting local hostname/identity adapters. Pin service API versions, provider version, region and experiment times. Normalize only declared volatile fields such as resource identifiers and timestamps. Preserve semantic errors and unexpected side effects. Specify a deadline and observation tail before testing, record late events, and distinguish allowed redelivery from duplicate business processing. A repeatable difference is a finding to investigate, not something to normalize away.

## Support requested, when outreach is authorized

- A bounded Azure research sandbox or credits, with region, permitted services, quotas, spend ceiling and cleanup ownership agreed before deployment. No monetary amount is estimated without the final resource manifest and duration.
- Engineering review of supported API semantics, especially Event Grid delivery and validation, Table conflicts, authentication and eventual consistency.
- An independent reproducer and research collaborator to review workload selection, methods and interpretation.

We can provide the current source, retained observations and a concrete pilot protocol. Support would fund the missing cloud comparison and independent assessment rather than an unmeasured promise of complete Azure compatibility. No paid runs, credit purchases or outreach are authorized by this brief.
