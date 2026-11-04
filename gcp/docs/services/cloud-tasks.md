# Cloud Tasks

## Current State

Support class: `bounded-runtime`

GlobalStack GCP includes an executable local Cloud Tasks runtime for the
documented queue and explicit HTTP dispatch subset. It is not a facade:
`tasks.run` performs a real HTTP request to the configured target and records
dispatch/response state.

Real-GCP differential capture, Terraform, Pulumi, OpenTofu, Config Connector,
Crossplane, `gcloud`, and SDK gates are still pending.

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/cloud-tasks/service.mjs`
- `gcp/src/services/cloud-tasks/store.mjs`
- `gcp/src/services/cloud-tasks/routes.mjs`
- `gcp/src/services/cloud-tasks/google-api.mjs`

Current validation:

- local Google-shaped REST runtime passes:
  - create queue
  - get queue
  - create HTTP task
  - get task
  - explicitly run task
  - dispatch task body and headers to a real local HTTP endpoint
  - record successful dispatch and response counts

Remaining promotion gates:

- real-GCP capture and local replay for queue/task lifecycle and errors
- Terraform, Pulumi, and OpenTofu lifecycle templates
- `gcloud tasks` and SDK lifecycle
- schedule-time execution, retry backoff, rate limiting, leasing, auth headers,
  App Engine targets, IAM, purge/pause/resume, and regional behavior

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
