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
- `terraform-pubsub.mjs`: starts the official Google Pub/Sub emulator, runs the
  Terraform Google provider Pub/Sub template through init/apply/message-flow
  check/no-drift plan/destroy, and removes temporary state unless
  `--keep-workdir` is passed.
- `opentofu-pubsub.mjs`: starts the official Google Pub/Sub emulator, runs the
  OpenTofu Google provider Pub/Sub template through init/apply/message-flow
  check/no-drift plan/destroy, and removes temporary state unless
  `--keep-workdir` is passed.
- `terraform-secret-manager.mjs` and `opentofu-secret-manager.mjs`: start local
  GlobalStack GCP, run the Google provider Secret Manager template through
  init/apply/version payload check/no-drift plan/destroy, and remove temporary
  state unless `--keep-workdir` is passed.
- `terraform-kms.mjs` and `opentofu-kms.mjs`: start local GlobalStack GCP, run
  the Google provider Cloud KMS template through init/apply/encrypt-decrypt
  check/no-drift plan/destroy, and remove temporary state unless
  `--keep-workdir` is passed.
- `terraform-cloud-tasks.mjs` and `opentofu-cloud-tasks.mjs`: start local
  GlobalStack GCP, run the Google provider Cloud Tasks queue template through
  init/apply, create and dispatch an HTTP task to a real local receiver, then
  run no-drift plan/destroy.
- `terraform-logging.mjs` and `opentofu-logging.mjs`: start local GlobalStack
  GCP, run the Google provider Cloud Logging metric template through
  init/apply, write and filter structured log entries, then run no-drift
  plan/destroy.
- `pulumi-cloud-storage.mjs`: starts local GlobalStack GCP, runs the Pulumi GCP
  provider Cloud Storage template through login/stack init/up/no-drift
  preview/destroy, and removes temporary state unless `--keep-workdir` is
  passed.
- `pulumi-pubsub.mjs`: starts the official Google Pub/Sub emulator, runs the
  Pulumi GCP provider Pub/Sub template through login/stack init/up/message-flow
  check/no-drift preview/destroy, and removes temporary state unless
  `--keep-workdir` is passed.
- `pulumi-secret-manager.mjs`, `pulumi-kms.mjs`,
  `pulumi-cloud-tasks.mjs`, and `pulumi-logging.mjs`: start local GlobalStack
  GCP, run the Pulumi GCP provider templates through login/stack init/up,
  verify runtime side effects, run no-drift preview, and destroy.
- `gcloud-cloud-storage.mjs`: starts local GlobalStack GCP, configures an
  isolated Cloud SDK profile, and runs Cloud Storage bucket/object
  create/copy/list/delete.
- `gcloud-pubsub.mjs`: starts the official Google Pub/Sub emulator through the
  GlobalStack service-owned engine adapter, configures an isolated Cloud SDK
  profile with `api_endpoint_overrides/pubsub`, and runs topic/subscription
  create, publish, pull with auto-ack, and delete.
- `sdk-node-cloud-storage.mjs`: starts local GlobalStack GCP, installs the
  official Node.js Cloud Storage client in a temporary workspace, and runs
  bucket/object create/save/list/delete.
- `sdk-node-pubsub.mjs`: starts the official Google Pub/Sub emulator through
  the GlobalStack service-owned engine adapter, installs the official Node.js
  Pub/Sub client in a temporary workspace, and runs topic/subscription
  create/publish/deliver/ack/delete.
- `rest-secret-manager.mjs`: starts local GlobalStack GCP and runs
  Secret Manager create/get/list/version access/destroy/delete plus duplicate
  and destroyed-version error checks through the Google-shaped REST wrapper.
- `rest-kms.mjs`: starts local GlobalStack GCP and runs Cloud KMS key ring,
  crypto key, encrypt/decrypt, and AAD mismatch checks through the
  Google-shaped REST wrapper.
- `rest-logging.mjs`: starts local GlobalStack GCP and runs Cloud Logging
  `entries.write` plus project, log name, and severity filter checks through
  the Google-shaped REST wrapper.
- `rest-cloud-tasks.mjs`: starts local GlobalStack GCP and runs Cloud Tasks
  queue/task creation plus explicit HTTP dispatch to a real local receiver.

```bash
cd gcp
npm run e2e:terraform:storage
npm run e2e:opentofu:storage
npm run e2e:pulumi:storage
npm run e2e:gcloud:storage
npm run e2e:gcloud:pubsub
npm run e2e:sdk-node:storage
npm run e2e:sdk-node:pubsub
npm run e2e:rest:secret-manager
npm run e2e:rest:kms
npm run e2e:rest:logging
npm run e2e:rest:cloud-tasks
npm run e2e:terraform:secret-manager
npm run e2e:opentofu:secret-manager
npm run e2e:terraform:kms
npm run e2e:opentofu:kms
npm run e2e:terraform:cloud-tasks
npm run e2e:opentofu:cloud-tasks
npm run e2e:terraform:logging
npm run e2e:opentofu:logging
npm run e2e:pulumi:secret-manager
npm run e2e:pulumi:kms
npm run e2e:pulumi:cloud-tasks
npm run e2e:pulumi:logging
npm run e2e:terraform:pubsub
npm run e2e:opentofu:pubsub
npm run e2e:pulumi:pubsub
```
