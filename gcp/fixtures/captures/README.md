# Captures

Real GCP request and response captures belong here. Captures must be scrubbed
and linked from the service roadmap before they can drive parity work.

Generated captures use this shape:

```text
fixtures/captures/<service>/<run-id>/capture.json
```

The committed capture files must not include access tokens, private keys, raw
authorization headers, or unredacted dynamic server ids.

Current captures:

- `cloud-storage/cloud-storage-20260528113308-9ce4a0/capture.json`
- `pubsub/pubsub-20260528181924-0681af/capture.json`
- `pubsub/pubsub-advanced-20260528183303-0e0494/capture.json`
- `pubsub/pubsub-errors-20260528183941-57ee3e/capture.json`
- `pubsub/pubsub-schema-20260528185046-acfa7d/capture.json`
