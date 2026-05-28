# GlobalStack GCP Roadmap

This roadmap defines how GlobalStack should expand into GCP without weakening
the Azure product or repeating facade-only mistakes.

The target is not a vague "all of GCP" claim. The target is a defined,
evidence-backed GCP service program with Google-shaped APIs on the outside and
real local engines or executable runtimes underneath.

## Current Baseline

The current GCP emulator landscape snapshot is:

- broad Google Cloud catalog entries: `190`
- curated IaC/runtime services: `77`
- official Google emulator support on curated services: `5 / 77` (`6.5%`)
- `localgcp` support on curated services: `14 / 77` (`18.2%`)
- either official Google emulator or `localgcp`: `15 / 77` (`19.5%`)

Source:

- `gcp/docs/emulators/coverage.json`
- `gcp/docs/IAC-CONFORMANCE.md`

## Non-Negotiables

- Keep GCP work isolated under `gcp/` until it is mature enough to promote into
  first-class `apps/` and `packages/` surfaces.
- Do not modify Azure product paths for exploratory GCP work.
- Do not count facade-only behavior as real emulation for runtime-heavy
  services.
- Prefer official Google emulators when they exist.
- Prefer proven local engines when official emulators do not exist.
- Fail closed when a service or behavior has no real local substrate yet.
- Every real-GCP capture must clean up in a `finally` path and verify cleanup.
- Every billable resource must use a unique run id and cleanup labels where GCP
  supports labels.
- IaC clients must be treated as clients of one Google-shaped API surface, not
  as separate mocked paths.
- Terraform, Pulumi, OpenTofu, Config Connector, Crossplane, `gcloud`, and SDK
  failures are product gaps when the same scenario succeeds on real GCP.
- Any support claim must state the support class:
  `unsupported`, `control-plane-only`, `bounded-runtime`,
  `official-emulator-backed`, `real-engine-backed`, or
  `differentially-validated`.

## Support Classes

| Class | Meaning | Counts Toward Serious Parity |
|---|---|---|
| `unsupported` | No local behavior. | No |
| `control-plane-only` | Metadata CRUD exists, but no real runtime behavior. | No |
| `bounded-runtime` | Executable local behavior exists for a documented subset. | Partial |
| `official-emulator-backed` | Backed by an official Google emulator. | Yes, within emulator limits |
| `real-engine-backed` | Backed by a real local engine such as Docker, Postgres, Redis, registry, k3s, or object store. | Yes, within documented scope |
| `differentially-validated` | Real GCP captures and local replay prove behavior across create/read/update/delete, data plane, errors, timing, and IaC lifecycle. | Yes |

## Phase 0: Workspace And Safety

Goal: make GCP exploration safe, isolated, and repeatable.

Work:

- keep all GCP code and docs under `gcp/`
- maintain `gcp/docs/emulators/coverage.json`
- keep credentials outside the repo
- support ADC and service-account JSON validation without printing secrets
- add a real-GCP cleanup/sweeper before creating expensive resources
- standardize run labels:
  - `purpose=globalstack-conformance`
  - `owner=globalstack`
  - `run_id=<id>`

Exit criteria:

- `node gcp/scripts/check-credentials.mjs --adc` passes
- ADC token lookup works without printing tokens
- a cleanup sweeper can list and remove stale resources for the first service
  group
- Cloud Storage baseline capture runs with cleanup in `finally`
- no Azure source paths are touched by GCP setup

Status:

- complete for ADC validation, Cloud Storage capture, and Cloud Storage cleanup
  sweep
- complete for Pub/Sub capture cleanup plus stale topic, subscription, and
  snapshot sweep reporting/deletion by GlobalStack labels
- complete for bounded Cloud Storage local runtime replay against the captured
  bucket/object lifecycle
- next service capture targets still need to be added

## Phase 1: GCP Foundation Layer

Goal: build the common substrate that every GCP service needs.

Services and layers:

- projects and resource naming
- regions/zones/locations
- OAuth/ADC token handling
- IAM principals and service accounts
- Service Usage API enablement checks
- long-running operations
- Google JSON error envelopes
- gRPC error mapping
- request-id/correlation metadata

Engine strategy:

- local project registry
- auth/token facade around ADC-compatible flows
- deterministic operation store for long-running operations
- fail-closed API router for unsupported services and methods

IaC target:

- Terraform Google provider first
- Pulumi, OpenTofu, Config Connector, Crossplane, `gcloud`, and SDKs follow the
  same API surface; the required matrix is tracked in
  `gcp/docs/IAC-CONFORMANCE.md`

Exit criteria:

- Terraform can authenticate against local GlobalStack GCP endpoints
- project/service-enable/lro flows behave like captured GCP for a small set of
  operations
- unsupported APIs fail closed with Google-shaped errors
- real-GCP capture runner can create and clean up a no-op/lightweight resource

## Phase 2: First Runtime-Backed Service Bucket

Goal: prove the model on the highest-value services with real engines.

Services:

- Cloud Storage
- Pub/Sub
- Firestore
- Datastore mode
- Secret Manager
- Cloud KMS
- Cloud Logging
- Cloud Tasks

Engine strategy:

- Cloud Storage: real object-store backend with JSON/XML API compatibility
- Pub/Sub: official emulator first, broker-backed behavior where needed
- Firestore/Datastore: official emulator
- Secret Manager: executable versioned secret store
- Cloud KMS: executable local key engine for encrypt/decrypt/sign/verify subset
- Cloud Logging: local log store with write/list/query subset
- Cloud Tasks: executable scheduler/dispatcher with retry semantics

Exit criteria:

- create/read/update/delete via Terraform for every service in this bucket
- data-plane operations prove real side effects
- auth failures and permission failures match captured GCP shape
- destroy is complete and verified
- every service has support class at least `bounded-runtime`

Current first service evidence:

- Cloud Storage real-GCP capture is saved under
  `gcp/fixtures/captures/cloud-storage/cloud-storage-20260528113308-9ce4a0/capture.json`
- service note is saved under `gcp/docs/services/cloud-storage.md`
- bounded local replay test is saved under
  `gcp/tests/e2e/storage-capture-replay.test.mjs`
- Terraform lifecycle template is saved under
  `gcp/templates/terraform/cloud-storage/`
- Terraform lifecycle runner is saved under
  `gcp/scripts/e2e/terraform-cloud-storage.mjs`
- OpenTofu lifecycle runner is saved under
  `gcp/scripts/e2e/opentofu-cloud-storage.mjs`
- Pulumi lifecycle template is saved under `gcp/templates/pulumi/cloud-storage/`
- Pulumi lifecycle runner is saved under
  `gcp/scripts/e2e/pulumi-cloud-storage.mjs`
- `gcloud storage` lifecycle runner is saved under
  `gcp/scripts/e2e/gcloud-cloud-storage.mjs`
- Node.js SDK lifecycle template is saved under
  `gcp/templates/sdk/nodejs/cloud-storage/`
- Node.js SDK lifecycle runner is saved under
  `gcp/scripts/e2e/sdk-node-cloud-storage.mjs`
- Pub/Sub official emulator adapter is saved under
  `gcp/src/services/pubsub/emulator-engine.mjs`
- Pub/Sub Node.js SDK lifecycle template is saved under
  `gcp/templates/sdk/nodejs/pubsub/`
- Pub/Sub Node.js SDK lifecycle runner is saved under
  `gcp/scripts/e2e/sdk-node-pubsub.mjs`
- Pub/Sub Terraform lifecycle template is saved under
  `gcp/templates/terraform/pubsub/`
- Pub/Sub Terraform/OpenTofu lifecycle runners are saved under
  `gcp/scripts/e2e/terraform-pubsub.mjs` and
  `gcp/scripts/e2e/opentofu-pubsub.mjs`
- Pub/Sub Pulumi lifecycle template is saved under
  `gcp/templates/pulumi/pubsub/`
- Pub/Sub Pulumi lifecycle runner is saved under
  `gcp/scripts/e2e/pulumi-pubsub.mjs`
- Pub/Sub `gcloud` lifecycle runner is saved under
  `gcp/scripts/e2e/gcloud-pubsub.mjs`
- Pub/Sub real-GCP capture is saved under
  `gcp/fixtures/captures/pubsub/pubsub-20260528181924-0681af/capture.json`
- Pub/Sub capture runner is saved under `gcp/scripts/capture/pubsub-baseline.mjs`
- Pub/Sub advanced real-GCP capture is saved under
  `gcp/fixtures/captures/pubsub/pubsub-advanced-20260528183303-0e0494/capture.json`
- Pub/Sub advanced capture runner is saved under
  `gcp/scripts/capture/pubsub-advanced-baseline.mjs`
- Pub/Sub error-shape real-GCP capture is saved under
  `gcp/fixtures/captures/pubsub/pubsub-errors-20260528183941-57ee3e/capture.json`
- Pub/Sub error-shape capture runner is saved under
  `gcp/scripts/capture/pubsub-error-baseline.mjs`
- Pub/Sub schema real-GCP capture is saved under
  `gcp/fixtures/captures/pubsub/pubsub-schema-20260528185046-acfa7d/capture.json`
- Pub/Sub schema capture runner is saved under
  `gcp/scripts/capture/pubsub-schema-baseline.mjs`
- Pub/Sub seek-redelivery real-GCP capture is saved under
  `gcp/fixtures/captures/pubsub/pubsub-seek-20260528185442-6edd4c/capture.json`
- Pub/Sub seek-redelivery capture runner is saved under
  `gcp/scripts/capture/pubsub-seek-redelivery-baseline.mjs`
- Pub/Sub local replay test is saved under
  `gcp/tests/e2e/pubsub-capture-replay.test.mjs`
- Pub/Sub local push subscription runtime test is saved under
  `gcp/tests/e2e/pubsub-push-runtime.test.mjs`
- Pub/Sub dead-letter gap test is saved under
  `gcp/tests/e2e/pubsub-dead-letter-gap.test.mjs`
- Firestore official emulator adapter is saved under
  `gcp/src/services/firestore/emulator-engine.mjs`
- Firestore REST API wrapper is saved under
  `gcp/src/services/firestore/google-api.mjs`
- Firestore local document lifecycle test is saved under
  `gcp/tests/e2e/firestore-emulator-runtime.test.mjs`
- Secret Manager executable versioned store is saved under
  `gcp/src/services/secret-manager/store.mjs`
- Secret Manager Google-shaped routes and API wrapper are saved under
  `gcp/src/services/secret-manager/routes.mjs` and
  `gcp/src/services/secret-manager/google-api.mjs`
- Secret Manager local version lifecycle test is saved under
  `gcp/tests/e2e/secret-manager-runtime.test.mjs`
- Cloud KMS executable key engine is saved under
  `gcp/src/services/kms/store.mjs`
- Cloud KMS Google-shaped routes and API wrapper are saved under
  `gcp/src/services/kms/routes.mjs` and `gcp/src/services/kms/google-api.mjs`
- Cloud KMS local encrypt/decrypt lifecycle test is saved under
  `gcp/tests/e2e/kms-runtime.test.mjs`
- Cloud Logging executable log store is saved under
  `gcp/src/services/logging/store.mjs`
- Cloud Logging Google-shaped routes and API wrapper are saved under
  `gcp/src/services/logging/routes.mjs` and
  `gcp/src/services/logging/google-api.mjs`
- Cloud Logging local write/list/filter test is saved under
  `gcp/tests/e2e/logging-runtime.test.mjs`

## Phase 3: Compute And Container Runtime

Goal: make GCP workloads execute locally, not just deploy metadata.

Services:

- Cloud Run
- Cloud Functions
- Google Kubernetes Engine
- Artifact Registry
- Cloud SQL
- Memorystore

Engine strategy:

- Cloud Run: Docker-backed request runtime
- Cloud Functions: build on Cloud Run/function runtime where practical
- GKE: k3s or kind-backed cluster substrate
- Artifact Registry: local Docker Registry-backed image storage
- Cloud SQL: real Postgres/MySQL containers
- Memorystore: real Redis

Exit criteria:

- Terraform deploys a service, invokes it, observes side effects, and destroys it
- GKE kubeconfig points at a real local cluster
- Cloud SQL connections use a real database engine
- Artifact Registry can push/pull images through a Google-shaped endpoint
- no runtime-heavy service in this phase is facade-only

## Phase 4: Eventing, Integration, And Orchestration

Goal: support enterprise event-driven flows.

Services:

- Eventarc
- Workflows
- Cloud Scheduler
- Application Integration
- API Gateway
- Cloud Endpoints
- Apigee, bounded initially

Engine strategy:

- executable event router
- workflow interpreter for a documented Workflows subset
- scheduler/timer runtime
- API gateway/router with backend invocation
- bounded Apigee management and gateway behavior where backed by a real router

Exit criteria:

- Pub/Sub/Eventarc/Cloud Run/Workflows flow executes end to end
- invalid events and unauthorized calls fail with captured error shapes
- scheduled invocations are repeatable and cleanup-safe
- integration tests verify side effects, not just deployed resources

## Phase 5: Networking And Security

Goal: support realistic enterprise topology.

Services:

- Virtual Private Cloud
- Cloud DNS
- Cloud Load Balancing
- Cloud NAT
- Private Service Connect
- Network Connectivity Center
- Cloud CDN
- Cloud Armor
- Identity-Aware Proxy
- VPC Service Controls

Engine strategy:

- local network model
- DNS resolver
- edge/router runtime
- load-balancing proxy
- security policy evaluator
- IAM-aware request authorization

Exit criteria:

- private/public routing behavior is executable locally
- DNS resolution changes after create/update/delete
- load-balanced requests reach real local backends
- security policy decisions are enforced at runtime
- IaC lifecycle refresh behaves across Terraform and Pulumi

## Phase 6: Analytics And Data Systems

Goal: cover enterprise data pipelines with bounded execution.

Services:

- BigQuery
- Dataflow
- Dataproc
- Managed Service for Apache Spark
- Managed Service for Apache Kafka
- Cloud Data Fusion
- Datastream
- Database Migration Service

Engine strategy:

- BigQuery: DuckDB-backed SQL subset
- Kafka: real Kafka-compatible broker where practical
- Spark/Dataproc/Dataflow: bounded executable job runner first
- DMS/Datastream: local replication-state model plus real source/target DBs

Exit criteria:

- IaC creates jobs, datasets, streams, and connections
- selected jobs execute locally and produce queryable output
- failure states and retries match real GCP captures for scoped cases
- no unsupported data execution is silently accepted

## Phase 7: Observability And Operations

Goal: make runtime behavior inspectable through Google-shaped APIs.

Services:

- Cloud Monitoring
- Cloud Trace
- Cloud Profiler, bounded
- Error Reporting
- Managed Service for Prometheus
- Personalized Service Health, bounded

Engine strategy:

- local metric store
- trace/span store
- error event store
- Prometheus-compatible scrape/query path where practical

Exit criteria:

- deployed runtimes emit logs/metrics/traces into local stores
- Monitoring alert policies evaluate against local metrics for scoped cases
- Terraform/Pulumi can create/read/delete monitoring resources
- integration tests query observability side effects

## Phase 8: AI And Industry Services

Goal: support useful bounded local behavior without pretending to emulate cloud
AI models fully.

Services:

- Vertex AI
- Document AI
- Vision API
- Speech-to-Text
- Text-to-Speech
- Translation AI
- Natural Language
- Cloud Healthcare API

Engine strategy:

- Vertex AI: local model bridge or deterministic bounded model responses
- document/vision/speech/text APIs: bounded local processors or deterministic
  fixtures
- Healthcare API: bounded FHIR store and validation

Exit criteria:

- all claims are explicitly bounded
- no model service claims full cloud parity
- IaC can provision endpoints/stores/processors
- runtime tests exercise deterministic side effects and error paths

## Phase 9: IaC Platform Breadth

Goal: make support user-visible across real IaC tools.

Platforms:

- Terraform Google provider
- Pulumi GCP
- Config Connector
- Deployment Manager only if still valuable

Work:

- build platform runners
- export shipment bundles
- generate adversarial tasks
- enforce prompt/unit/integration alignment
- keep GCP task artifacts provider-native and free of GlobalStack leakage

Exit criteria:

- each platform has green lifecycle bundles for the first service bucket
- each bundle writes `execution.log` and `execution-report.json`
- integration tests first prove service existence, then runtime flow semantics

## Phase 10: Differential Conformance And Drift

Goal: make parity measurable and hard to fool.

Work:

- real-GCP capture fixtures per supported operation
- local replay expectations
- differential runner: real GCP vs GlobalStack GCP
- timing and eventual-consistency windows
- invalid request/error-shape matrix
- scheduled drift reruns

Exit criteria:

- every serious support claim is backed by capture evidence
- every runtime-heavy service has real local side-effect tests
- roadmap percentages are generated from evidence, not hand-written claims
- mismatches become product gaps, not normalized away

## Phase 11: Promotion Into Product Packages

Goal: move from isolated exploration into first-class product architecture only
after the foundation is real.

Promotion threshold:

- GCP foundation layer is working
- first runtime-backed service bucket is green through Terraform
- real-GCP cleanup sweeper is proven
- conformance fixtures and local replay exist
- no Azure package has been polluted with GCP-specific behavior

Target structure after promotion:

```text
apps/
  gcp-emulator/

packages/
  gcp-control-plane/
  gcp-data-plane/
  gcp-conformance/
  gcp-platform-registry/
```

The isolated `gcp/` workspace can remain the planning area after promotion, but
runtime product code should move into package-owned modules.

## Immediate Next Work

1. Add a cleanup-first real-GCP conformance harness under `gcp/scripts/`.
2. Add a tiny Service Usage/project/auth capture that creates no billable
   resource.
3. Add the first Cloud Storage capture with create/read/delete and cleanup
   verification.
4. Add a local Cloud Storage engine prototype backed by a real object store.
5. Add Terraform Google provider runner only after the auth and storage capture
   path is stable.
6. Repeat for Pub/Sub using the official emulator.
7. Build the first GCP shipment bundle and require service existence plus
   runtime side-effect integration tests.

## Current Open Risks

- ADC currently uses user credentials, not a dedicated service account. This is
  acceptable for early capture work but should move to impersonation or a
  dedicated service account before broad testing.
- Some GCP resources can be expensive even when idle. Expensive services must not
  be created until their cleanup sweeper exists.
- gRPC-heavy services require protocol-level handling, not just HTTP routing.
- Service enablement and IAM propagation can introduce timing windows that must
  be captured from real GCP before being modeled locally.
