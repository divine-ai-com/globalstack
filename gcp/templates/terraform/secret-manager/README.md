# Terraform Secret Manager Template

This template exercises the Google provider against GlobalStack GCP Secret
Manager through `secret_manager_custom_endpoint`.

It creates a secret, adds a secret version, exposes Terraform outputs for
metadata validation, and expects destroy to remove the secret from the local
runtime.
