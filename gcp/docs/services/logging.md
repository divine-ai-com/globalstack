# Cloud Logging

## Current State

Support class: `bounded-runtime`

GlobalStack GCP includes an executable local Cloud Logging store for the
documented write/list/filter subset. It is not a facade: `entries.write` stores
structured log entries in runtime state, and `entries.list` filters those
entries by project resource, `logName`, and severity.

Real-GCP differential capture, Terraform, Pulumi, OpenTofu, Config Connector,
Crossplane, `gcloud`, and SDK gates are still pending.

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/logging/service.mjs`
- `gcp/src/services/logging/store.mjs`
- `gcp/src/services/logging/routes.mjs`
- `gcp/src/services/logging/google-api.mjs`

Current validation:

- local Google-shaped REST runtime passes:
  - write structured log entries
  - list entries by project resource
  - filter entries by `logName`
  - filter entries by severity
  - preserve labels and JSON payloads

Remaining promotion gates:

- real-GCP capture and local replay for write/list/filter/error behavior
- Terraform, Pulumi, and OpenTofu lifecycle templates where applicable
- `gcloud logging` and SDK lifecycle
- sinks, metrics, exclusions, log buckets, views, pagination, ordering, advanced
  filter language, IAM, and regional behavior

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
