# Capture Scripts

Scripts in this directory exercise real GCP APIs, save scrubbed request/response
traces, and register cleanup handlers for every created resource.

Run scripts without `--apply` first to inspect the plan:

```bash
cd gcp
npm run capture:storage
npm run capture:pubsub
npm run capture:pubsub:advanced
npm run capture:pubsub:errors
npm run capture:pubsub:schema
```

Real captures require `--apply` and always execute cleanup in a `finally` path:

```bash
cd gcp
npm run capture:storage -- --apply --bucket-location=US
npm run capture:pubsub -- --apply
npm run capture:pubsub:advanced -- --apply
npm run capture:pubsub:errors -- --apply
npm run capture:pubsub:schema -- --apply
```

The real-GCP sweeper reports stale GlobalStack-labeled Cloud Storage buckets and
Pub/Sub topics, subscriptions, snapshots, and schema capture resources before
any delete is attempted:

```bash
cd gcp
npm run sweep
npm run sweep -- --apply
```
