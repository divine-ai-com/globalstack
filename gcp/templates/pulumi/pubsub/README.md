# Pub/Sub Pulumi Template

This template validates the Pulumi GCP provider against the official Pub/Sub
emulator-backed runtime.

It creates:

- one topic
- one pull subscription
- labels used for conformance tracing

The repeatable local runner is:

```bash
cd gcp
npm run e2e:pulumi:pubsub
```
