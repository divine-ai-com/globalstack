# Pub/Sub Module

This module owns Pub/Sub service behavior. Pub/Sub starts from the official
Google Pub/Sub emulator rather than a facade.

Implemented files:

- `service.mjs`: service registration and emulator entry point
- `emulator-engine.mjs`: starts/stops `gcloud beta emulators pubsub start`
  with an isolated data directory and exposes `PUBSUB_EMULATOR_HOST`

Future local broker extensions, Google API wrappers, service routes, stores,
error shapes, and tests stay inside this directory.
