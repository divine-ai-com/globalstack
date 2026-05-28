# Cloud Storage Node.js SDK Template

This template validates GlobalStack GCP with the official
`@google-cloud/storage` client library.

The repeatable local runner is:

```bash
cd gcp
npm run e2e:sdk-node:storage
```

The runner uses a temporary npm workspace under `/tmp` and removes installed
packages after each run.
