# Pub/Sub

## Current State

Support class: `official-emulator-backed`

GlobalStack GCP starts Pub/Sub with the official Google Pub/Sub emulator. This
is not a facade and does not count as full parity by itself: IAM integration,
REST/`gcloud`, Terraform-family providers, Pulumi, Kubernetes-control-plane
tools, real-GCP differential captures, and broker extension gaps are still
pending.

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/pubsub/service.mjs`
- `gcp/src/services/pubsub/emulator-engine.mjs`

Current validation:

- Google Cloud SDK `570.0.0` Pub/Sub emulator package is installed locally
- Java runtime is installed for the official emulator
- Node.js `@google-cloud/pubsub` `5.3.0` passes topic create, subscription
  create, publish, message delivery, ack, subscription delete, and topic delete
  against the official emulator
- the runner uses a temporary emulator data directory and removes it after each
  run

Remaining promotion gates:

- real-GCP capture and differential comparison for the same topic/subscription
  lifecycle
- Terraform Google provider lifecycle
- OpenTofu Google provider lifecycle
- Pulumi GCP provider lifecycle
- `gcloud pubsub` or a documented adapter path if Cloud SDK only supports REST
  endpoint overrides for that command group
- Config Connector and Crossplane lifecycle if Kubernetes-native Pub/Sub
  support is claimed
- IAM, ordering keys, dead-letter topics, retry policy, push subscriptions,
  snapshots, seek, schema, and error-shape captures

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
