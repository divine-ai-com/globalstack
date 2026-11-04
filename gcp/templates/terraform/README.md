# Terraform Templates

Terraform-family lifecycle templates belong here.

Current templates:

- `cloud-storage/`: Cloud Storage bucket/object lifecycle target.
- `pubsub/`: Pub/Sub topic/subscription lifecycle target backed by the
  official Pub/Sub emulator.
- `secret-manager/`: Secret Manager secret plus version lifecycle target.
- `kms/`: Cloud KMS key ring plus symmetric crypto key lifecycle target.
- `cloud-tasks/`: Cloud Tasks queue lifecycle target with dispatch verified by
  the runner.
- `logging/`: Cloud Logging log-based metric lifecycle target with structured
  log filtering verified by the runner.

Terraform and OpenTofu runners use these templates for Google provider
compatibility checks against the local GlobalStack GCP API surface.
