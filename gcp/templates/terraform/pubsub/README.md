# Pub/Sub Terraform Template

This template validates Terraform-family providers against the official
Pub/Sub emulator-backed runtime.

It creates:

- one topic
- one pull subscription
- labels used for conformance tracing

The repeatable local runners are:

```bash
cd gcp
npm run e2e:terraform:pubsub
npm run e2e:opentofu:pubsub
```
