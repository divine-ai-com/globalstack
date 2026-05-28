# E2E Scripts

End-to-end scripts in this directory run local GlobalStack GCP flows through
SDK, CLI, Terraform, OpenTofu, Pulumi, Config Connector, or Crossplane clients.

Current scripts:

- `terraform-cloud-storage.mjs`: starts local GlobalStack GCP, runs the
  Terraform Google provider Cloud Storage template through init/apply/no-drift
  plan/destroy, and removes temporary state unless `--keep-workdir` is passed.

```bash
cd gcp
npm run e2e:terraform:storage
```
