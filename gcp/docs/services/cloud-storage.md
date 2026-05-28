# Cloud Storage

## Current State

Support class: `bounded-runtime`

GlobalStack GCP now has a bounded local Cloud Storage runtime for the captured
JSON API bucket/object lifecycle. It is not marked `real-engine-backed` or
`differentially-validated` yet because Terraform/Pulumi provider lifecycle runs
are still pending.

## Capture Evidence

Baseline capture:

- `gcp/fixtures/captures/cloud-storage/cloud-storage-20260528113308-9ce4a0/capture.json`

Covered real-GCP operations:

- get missing bucket before create
- create bucket with labels, versioning, and uniform bucket-level access
- insert object
- get bucket
- list buckets
- get object metadata
- list objects
- duplicate bucket create error
- patch bucket labels
- delete object
- delete bucket
- verify bucket is gone after cleanup

Cleanup result:

- object deleted
- bucket deleted
- stale-resource sweeper found no labeled leftovers after the run

## Implementation Notes

Cloud Storage code must remain under `gcp/src/services/storage/`.

Implemented local module files:

- `gcp/src/services/storage/service.mjs`
- `gcp/src/services/storage/routes.mjs`
- `gcp/src/services/storage/store.mjs`
- `gcp/src/services/storage/errors.mjs`
- `gcp/src/services/storage/google-api.mjs`

Current validation:

- local replay passes against the real-GCP capture
- bucket/object side effects are backed by local filesystem state
- unsupported services still fail closed

Remaining promotion gates:

- Terraform Google provider create/read/update/destroy lifecycle
- Pulumi provider create/read/update/destroy lifecycle
- OpenTofu provider create/read/update/destroy lifecycle
- Config Connector and Crossplane lifecycle if Kubernetes-native Storage
  support is claimed
- `gcloud` and SDK direct lifecycle checks
- broader auth, IAM, object upload mode, and error-shape captures

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
