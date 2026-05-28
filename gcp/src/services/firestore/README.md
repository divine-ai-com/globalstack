# Firestore And Datastore Module

This module owns Firestore and Datastore-mode behavior. The implementation must
keep official emulator orchestration, Google API wrappers, local route adapters,
stores, error shapes, and tests inside this directory.

Implemented files:

- `service.mjs`: service registration and emulator entry point
- `emulator-engine.mjs`: starts/stops `gcloud beta emulators firestore start`
  on an isolated local port
- `google-api.mjs`: Firestore REST API wrapper used by local runtime and future
  differential tests

Datastore mode remains pending until it has its own emulator mode coverage and
tests.
