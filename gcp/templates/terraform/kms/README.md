# Terraform Cloud KMS Template

This template exercises the Google provider against GlobalStack GCP Cloud KMS
through `kms_custom_endpoint`.

It creates a key ring and symmetric crypto key, then expects refresh and
no-drift planning to read the same Google-shaped resources from the local
runtime.
