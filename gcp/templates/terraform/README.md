# Terraform Templates

Terraform-family lifecycle templates belong here.

Current templates:

- `cloud-storage/`: Cloud Storage bucket/object lifecycle target.
- `pubsub/`: Pub/Sub topic/subscription lifecycle target backed by the
  official Pub/Sub emulator.
- `secret-manager/`: Secret Manager secret plus version lifecycle target.
- `kms/`: Cloud KMS key ring plus symmetric crypto key lifecycle target.

Terraform and OpenTofu runners use these templates for Google provider
compatibility checks against the local GlobalStack GCP API surface.
