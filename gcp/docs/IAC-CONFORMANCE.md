# GCP IaC Conformance

GlobalStack GCP treats every IaC platform as a client of the same Google-shaped
API surface. Terraform, Pulumi, OpenTofu, Config Connector, Crossplane,
`gcloud`, and SDKs must not receive special-case behavior. If one tool exposes a
mismatch that real GCP does not expose, the mismatch is a GlobalStack product
gap.

## Principle

The local emulator must behave like real GCP at the API boundary. IaC tools can
generate different request sequences, retries, headers, polling loops, and
read-after-write checks, but those differences should all converge on the same
service runtime and the same captured Google behavior.

## Required Tool Matrix

| Tool | Priority | Why It Matters | Gate |
|---|---:|---|---|
| Terraform Google provider | 1 | Most common enterprise GCP IaC path and the base for many module ecosystems. | Required before `real-engine-backed` |
| Pulumi GCP providers | 2 | Common in teams that prefer TypeScript, Python, Go, C#, Java, or YAML. | Required before `real-engine-backed` for application-facing services |
| OpenTofu Google provider | 3 | Terraform-compatible enterprise path with separate CLI/registry behavior. | Required before broad Terraform-family claims |
| Config Connector | 4 | Kubernetes-native GCP resource model used by GKE and GitOps-heavy teams. | Required before Kubernetes-control-plane claims |
| Crossplane GCP provider | 5 | Platform-engineering control-plane path for internal developer platforms. | Required before Crossplane/platform claims |
| `gcloud` | 6 | Common automation and diagnostic client. | Required for service admin workflows |
| Google SDKs/client libraries | 7 | Validates direct API consumers outside IaC. | Required for data-plane/runtime services |

Deployment Manager is legacy-only. Do not make it a default promotion gate for
new GlobalStack GCP work.

## Promotion Gates

Each service moves through these gates:

| Gate | Requirement |
|---|---|
| Real-GCP capture | Disposable real resource run captures create/read/update/delete, data-plane behavior, errors, and cleanup. |
| Local replay | GlobalStack replays the captured lifecycle and matches status codes, stable fields, error envelopes, and side effects. |
| Terraform lifecycle | Terraform creates, refreshes, updates, plans, destroys, and verifies cleanup against GlobalStack. |
| Pulumi lifecycle | Pulumi performs the same lifecycle without service-specific workarounds. |
| OpenTofu lifecycle | OpenTofu performs the same lifecycle where Terraform support is claimed. |
| Kubernetes-control-plane lifecycle | Config Connector and Crossplane perform the lifecycle where Kubernetes-native support is claimed. |
| CLI/SDK lifecycle | `gcloud` and SDK clients validate direct admin/data-plane behavior. |
| Drift and repeatability | Repeated runs detect no stale state, timing drift, or cleanup residue. |

## Support-Class Meaning

- `unsupported`: no local runtime behavior.
- `control-plane-only`: metadata CRUD only; does not count as runtime emulation.
- `bounded-runtime`: local runtime exists for a documented captured subset.
- `official-emulator-backed`: service uses an official Google emulator and
  documents emulator limits.
- `real-engine-backed`: local runtime plus major IaC lifecycle gates pass.
- `differentially-validated`: repeated real-GCP differential runs pass across
  captures, local replay, IaC tools, CLI, SDKs, errors, cleanup, and drift.

## Failure Rule

No tool-specific workaround should mask a product gap. When Terraform, Pulumi,
OpenTofu, Config Connector, Crossplane, `gcloud`, or an SDK fails against
GlobalStack but succeeds against real GCP for the same scenario, the failure must
be captured as a service gap and fixed in the emulator.

## Current Matrix

| Service | Real-GCP Capture | Local Replay | Terraform | Pulumi | OpenTofu | Config Connector | Crossplane | `gcloud` | SDK |
|---|---|---|---|---|---|---|---|---|---|
| Cloud Storage | passed | passed | passed with Terraform 1.15.5 and Google provider 5.45.2 | passed with Pulumi 3.243.0 and Pulumi GCP provider 9.24.0 | passed with OpenTofu 1.12.1 and Google provider 5.45.2 | pending | pending | passed with Google Cloud SDK 570.0.0 | passed with Node.js `@google-cloud/storage` 7.19.0 |
| Pub/Sub | passed baseline, advanced, error-shape, and schema captures | passed baseline, ordering/retry/snapshot/seek, error envelope, schema validation/publish replay, and local HTTP push delivery with official Pub/Sub emulator 570.0.0; dead-letter redrive is documented as a runtime gap | passed with Terraform 1.15.5 and Google provider 5.45.2 | passed with Pulumi 3.243.0 and Pulumi GCP provider 9.24.0 | passed with OpenTofu 1.12.1 and Google provider 5.45.2 | pending | pending | passed with Google Cloud SDK 570.0.0 against the official Pub/Sub emulator endpoint override | passed with Node.js `@google-cloud/pubsub` 5.3.0 |
| Firestore | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| Datastore mode | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| Secret Manager | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| Cloud KMS | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| Cloud Logging | pending | pending | pending | pending | pending | pending | pending | pending | pending |
| Cloud Tasks | pending | pending | pending | pending | pending | pending | pending | pending | pending |
