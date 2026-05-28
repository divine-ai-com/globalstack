# Cloud Storage Terraform Template

This template is the first Terraform provider lifecycle target for GlobalStack
GCP Cloud Storage.

It is intentionally small and tied to the captured local runtime subset:

- bucket create/read/update/delete
- versioning
- uniform bucket-level access
- labels
- object create/read/delete

Run only after starting the local GCP server:

```bash
cd gcp
npm run start
```

Then run Terraform or OpenTofu from this directory with a unique bucket name and
the local endpoint:

```bash
terraform init
terraform apply \
  -var='project_id=globalstack-local' \
  -var='bucket_name=gst-tf-storage-example' \
  -var='object_name=artifacts/example/sample.json' \
  -var='object_content={run_id="tf-example",purpose="globalstack gcp terraform"}' \
  -var='labels={purpose="globalstack-conformance",owner="globalstack",run_id="tf-example"}'
terraform destroy
```

The current workspace does not have `terraform` or `tofu` installed, so this
template is committed as the next provider-handshake target rather than a passed
gate.
