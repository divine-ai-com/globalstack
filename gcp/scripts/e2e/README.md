# E2E Scripts

End-to-end scripts in this directory run local GlobalStack GCP flows through
SDK, CLI, Terraform, OpenTofu, Pulumi, Config Connector, or Crossplane clients.

Current scripts:

- `terraform-cloud-storage.mjs`: starts local GlobalStack GCP, runs the
  Terraform Google provider Cloud Storage template through init/apply/no-drift
  plan/destroy, and removes temporary state unless `--keep-workdir` is passed.
- `opentofu-cloud-storage.mjs`: starts local GlobalStack GCP, runs the OpenTofu
  Google provider Cloud Storage template through init/apply/no-drift
  plan/destroy, and removes temporary state unless `--keep-workdir` is passed.
- `pulumi-cloud-storage.mjs`: starts local GlobalStack GCP, runs the Pulumi GCP
  provider Cloud Storage template through login/stack init/up/no-drift
  preview/destroy, and removes temporary state unless `--keep-workdir` is
  passed.
- `gcloud-cloud-storage.mjs`: starts local GlobalStack GCP, configures an
  isolated Cloud SDK profile, and runs Cloud Storage bucket/object
  create/copy/list/delete.
- `sdk-node-cloud-storage.mjs`: starts local GlobalStack GCP, installs the
  official Node.js Cloud Storage client in a temporary workspace, and runs
  bucket/object create/save/list/delete.
- `sdk-node-pubsub.mjs`: starts the official Google Pub/Sub emulator through
  the GlobalStack service-owned engine adapter, installs the official Node.js
  Pub/Sub client in a temporary workspace, and runs topic/subscription
  create/publish/deliver/ack/delete.

```bash
cd gcp
npm run e2e:terraform:storage
npm run e2e:opentofu:storage
npm run e2e:pulumi:storage
npm run e2e:gcloud:storage
npm run e2e:sdk-node:storage
npm run e2e:sdk-node:pubsub
```
