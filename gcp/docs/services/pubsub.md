# Pub/Sub

## Current State

Support class: `official-emulator-backed`

GlobalStack GCP starts Pub/Sub with the official Google Pub/Sub emulator. This
is not a facade and does not count as full parity by itself: IAM integration,
REST/`gcloud`, Terraform-family providers, Pulumi, Kubernetes-control-plane
tools, broader real-GCP differentials, and broker extension gaps are still
pending.

## Capture Evidence

Baseline capture:

- `gcp/fixtures/captures/pubsub/pubsub-20260528181924-0681af/capture.json`

Covered real-GCP operations:

- get missing topic before create
- create topic with labels
- create pull subscription with labels, ack deadline, and message retention
- get topic
- list topics
- get subscription
- list subscriptions
- duplicate topic create error
- publish message
- pull message
- acknowledge message
- delete subscription
- delete topic
- verify subscription and topic are gone after cleanup

Cleanup result:

- subscription deleted
- topic deleted

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/pubsub/service.mjs`
- `gcp/src/services/pubsub/emulator-engine.mjs`
- `gcp/src/services/pubsub/google-api.mjs`

Current validation:

- Google Cloud SDK `570.0.0` Pub/Sub emulator package is installed locally
- Java runtime is installed for the official emulator
- local replay passes against the real-GCP capture using the official emulator
- Node.js `@google-cloud/pubsub` `5.3.0` passes topic create, subscription
  create, publish, message delivery, ack, subscription delete, and topic delete
  against the official emulator
- Terraform `1.15.5` with Google provider `5.45.2` passes topic/subscription
  init/apply/message-flow/no-drift plan/destroy against the official emulator
- OpenTofu `1.12.1` with Google provider `5.45.2` passes the same
  topic/subscription lifecycle and message-flow check against the official
  emulator
- Pulumi `3.243.0` with Pulumi GCP provider `9.24.0` passes
  login/stack init/up/message-flow/no-drift preview/destroy against the
  official emulator
- Google Cloud SDK `570.0.0` passes `gcloud pubsub` topic create, subscription
  create, publish, pull with auto-ack, subscription delete, and topic delete
  against the official emulator through `api_endpoint_overrides/pubsub`
- the runner uses a temporary emulator data directory and removes it after each
  run

Remaining promotion gates:

- Config Connector and Crossplane lifecycle if Kubernetes-native Pub/Sub
  support is claimed
- broader real-GCP differential captures for IAM, ordering keys, dead-letter
  topics, retry policy, push subscriptions, snapshots, seek, schema, and error
  shapes

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
