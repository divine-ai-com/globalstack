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

Advanced capture:

- `gcp/fixtures/captures/pubsub/pubsub-advanced-20260528183303-0e0494/capture.json`

Error-shape capture:

- `gcp/fixtures/captures/pubsub/pubsub-errors-20260528183941-57ee3e/capture.json`

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

Covered advanced real-GCP operations:

- create topic
- create subscription with message ordering, retained acked messages, and retry
  policy
- verify advanced subscription policy after read
- publish two ordered messages with ordering key and attributes
- pull and verify ordered payloads, ordering key, and attributes
- acknowledge ordered messages
- create snapshot
- get snapshot
- seek subscription to snapshot
- delete snapshot, subscription, and topic
- verify snapshot, subscription, and topic are gone after cleanup

Covered real-GCP error-shape operations:

- get missing topic
- create subscription with missing topic
- publish to missing topic
- pull missing subscription
- create duplicate subscription
- create snapshot from missing subscription
- seek subscription to missing snapshot
- delete missing snapshot
- verify subscription and topic missing after cleanup

Cleanup result:

- subscription deleted
- topic deleted
- advanced snapshot deleted
- advanced subscription deleted
- advanced topic deleted
- error-shape subscription deleted
- error-shape topic deleted

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/pubsub/service.mjs`
- `gcp/src/services/pubsub/emulator-engine.mjs`
- `gcp/src/services/pubsub/google-api.mjs`

Current validation:

- Google Cloud SDK `570.0.0` Pub/Sub emulator package is installed locally
- Java runtime is installed for the official emulator
- local replay passes against baseline, advanced, and error-shape real-GCP
  captures using the official emulator
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
- advanced replay passes message ordering, retained acked messages, retry
  policy, snapshot creation, snapshot read, and seek-to-snapshot status against
  the official emulator
- error-shape replay passes captured status and Google error envelope checks for
  missing resources, duplicate subscription, missing snapshot, and cleanup reads
  against the official emulator
- the runner uses a temporary emulator data directory and removes it after each
  run

Remaining promotion gates:

- Config Connector and Crossplane lifecycle if Kubernetes-native Pub/Sub
  support is claimed
- broader real-GCP differential captures for IAM, dead-letter topics, push
  subscriptions, schema, and richer seek redelivery semantics

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
