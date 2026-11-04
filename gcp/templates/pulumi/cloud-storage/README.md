# Cloud Storage Pulumi Template

This template is the Pulumi GCP provider lifecycle target for GlobalStack GCP
Cloud Storage.

It is intentionally tied to the captured local runtime subset:

- bucket create/read/update/delete
- versioning
- uniform bucket-level access
- labels
- object create/read/delete

The repeatable local runner is:

```bash
cd gcp
npm run e2e:pulumi:storage
```

The runner uses a local Pulumi file backend in `/tmp`, a unique stack, and a
temporary copy of this template so no Pulumi state is written into the repo.
