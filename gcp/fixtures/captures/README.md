# Captures

Real GCP request and response captures belong here. Captures must be scrubbed
and linked from the service roadmap before they can drive parity work.

Generated captures use this shape:

```text
fixtures/captures/<service>/<run-id>/capture.json
```

The committed capture files must not include access tokens, private keys, raw
authorization headers, or unredacted dynamic server ids.
