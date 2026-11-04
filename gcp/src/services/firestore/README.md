# Firestore And Datastore Module

This module owns Firestore and Datastore-mode behavior. The implementation must
keep official emulator orchestration, Google API wrappers, local route adapters,
stores, error shapes, and tests inside this directory.

Implemented files:

- `service.mjs`: service registration and emulator entry point
- `emulator-engine.mjs`: starts/stops `gcloud beta emulators firestore start`
  on an isolated local port, including Datastore mode when requested
- `google-api.mjs`: Firestore REST API wrapper used by local runtime and future
  differential tests
- `datastore-api.mjs`: Datastore REST API wrapper used by Datastore-mode local
  runtime and future differential tests

Datastore mode is bounded to entity upsert, lookup, kind query, update, delete,
and missing lookup until real-GCP differentials and IaC gates are added.
