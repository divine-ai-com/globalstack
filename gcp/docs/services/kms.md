# Cloud KMS

## Current State

Support class: `bounded-runtime`

GlobalStack GCP includes an executable local Cloud KMS crypto runtime for the
documented symmetric encrypt/decrypt subset. It is not a metadata facade: crypto
keys own generated key material, encryption produces authenticated ciphertext,
decryption validates the key and additional authenticated data, and invalid AAD
fails.

Real-GCP differential capture, Terraform, Pulumi, OpenTofu, Config Connector,
Crossplane, `gcloud`, and SDK gates are still pending.

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/kms/service.mjs`
- `gcp/src/services/kms/store.mjs`
- `gcp/src/services/kms/routes.mjs`
- `gcp/src/services/kms/google-api.mjs`

Current validation:

- local Google-shaped REST runtime passes:
  - create key ring
  - reject duplicate key ring
  - get key ring
  - create symmetric crypto key
  - get crypto key
  - encrypt plaintext with additional authenticated data
  - decrypt ciphertext with matching additional authenticated data
  - reject decrypt with wrong additional authenticated data

Remaining promotion gates:

- real-GCP capture and local replay for key ring, key, encrypt, decrypt, and
  error shapes
- Terraform, Pulumi, and OpenTofu lifecycle templates
- `gcloud kms` and SDK lifecycle
- asymmetric sign/verify, key versions, rotation, IAM, import jobs, protection
  levels, etags, and regional behavior

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
