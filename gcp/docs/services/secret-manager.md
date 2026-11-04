# Secret Manager

## Current State

Support class: `bounded-runtime`

GlobalStack GCP includes an executable in-memory Secret Manager runtime for the
documented versioned-secret subset. It is not a facade: secret creation,
version creation, payload access, latest-version resolution, version destroy,
and destroyed-version access checks all mutate and read local runtime state.

Real-GCP differential capture, Terraform, Pulumi, OpenTofu, Config Connector,
Crossplane, `gcloud`, and SDK gates are still pending.

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/secret-manager/service.mjs`
- `gcp/src/services/secret-manager/store.mjs`
- `gcp/src/services/secret-manager/routes.mjs`
- `gcp/src/services/secret-manager/google-api.mjs`

Current validation:

- local Google-shaped REST runtime passes:
  - create secret
  - reject duplicate secret
  - get secret
  - list secrets
  - add two versions
  - access latest version
  - access numbered version
  - destroy version
  - reject access to destroyed version
  - delete secret
  - verify deleted secret returns Google-shaped `NOT_FOUND`

Remaining promotion gates:

- real-GCP capture and local replay for the version lifecycle
- Terraform, Pulumi, and OpenTofu lifecycle templates
- `gcloud secrets` and SDK lifecycle
- IAM, replication policy, version disable/enable, etags, annotations, and
  error-shape differentials

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
