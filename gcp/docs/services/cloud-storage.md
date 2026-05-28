# Cloud Storage

## Current State

Support class: `unsupported`

GlobalStack GCP does not yet emulate Cloud Storage. This page records the real
GCP evidence collected before implementing the local runtime.

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

The next implementation step is to add a real local object-store backed runtime
with Google Cloud Storage JSON API compatibility for the captured subset. The
service should stay `unsupported` until local replay passes against this capture
and Terraform can perform a create/read/update/destroy lifecycle against the
local endpoint.
