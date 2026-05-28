# Capture Scripts

Scripts in this directory exercise real GCP APIs, save scrubbed request/response
traces, and register cleanup handlers for every created resource.

Run scripts without `--apply` first to inspect the plan:

```bash
cd gcp
npm run capture:storage
```

Real captures require `--apply` and always execute cleanup in a `finally` path:

```bash
cd gcp
npm run capture:storage -- --apply --bucket-location=US
```
