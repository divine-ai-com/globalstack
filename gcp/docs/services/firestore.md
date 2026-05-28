# Firestore

## Current State

Support class: `official-emulator-backed`

GlobalStack GCP starts Firestore with the official Google Firestore emulator.
This is a real local runtime for the documented document lifecycle subset, not a
metadata facade. Real-GCP differential capture, Terraform, Pulumi, OpenTofu,
Config Connector, Crossplane, `gcloud`, and SDK gates are still pending.

## Runtime Evidence

Implemented local module files:

- `gcp/src/services/firestore/service.mjs`
- `gcp/src/services/firestore/emulator-engine.mjs`
- `gcp/src/services/firestore/google-api.mjs`

Current validation:

- Google Cloud SDK `570.0.0` Firestore emulator package is installed locally
- local REST document lifecycle passes against the official emulator:
  - create document
  - get document
  - list collection documents
  - replace/update document
  - delete document
  - verify deleted document returns Google-shaped `NOT_FOUND`
- the runner starts the official emulator on an isolated port and stops the
  process group after the test

Remaining promotion gates:

- real-GCP document lifecycle capture and local replay
- Terraform, Pulumi, and OpenTofu lifecycle templates
- `gcloud firestore` and SDK lifecycle
- query, transaction, batch write, composite index, watch/listen, and error
  shape differentials
- Config Connector and Crossplane lifecycle if Kubernetes-native Firestore
  support is claimed

The cross-tool matrix is tracked in `gcp/docs/IAC-CONFORMANCE.md`.
