# Pub/Sub Node.js SDK Template

This template validates GlobalStack GCP with the official
`@google-cloud/pubsub` client library and the official Google Pub/Sub emulator.

The repeatable local runner is:

```bash
cd gcp
npm run e2e:sdk-node:pubsub
```

The runner uses a temporary npm workspace under `/tmp`, starts the official
Pub/Sub emulator through the service-owned engine adapter, and removes packages
and emulator data after each run.
