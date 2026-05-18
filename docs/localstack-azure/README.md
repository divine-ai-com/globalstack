# LocalStack for Azure Coverage Snapshot

`coverage.json` is generated from the public LocalStack for Azure docs site.
It follows the same intent as the existing LocalStack AWS snapshot shape, but it
stays in this GlobalStack workspace.

Regenerate it with:

```bash
npm run fetch:azure-coverage
```

The Azure docs currently publish service pages and client-side
`AzureFeatureCoverage` data modules. The generated snapshot records:

- public Azure service pages from `https://docs.localstack.cloud/azure/services/`
- Azure provider coverage modules referenced by `AzureFeatureCoverage`
- flattened operation keys in the form `<ResourceGroup>.<Operation>`
- `implemented`, `tier`, `pro`, and `snapshot` flags where LocalStack publishes them

Azure coverage does not currently expose an AWS-style `aws_validated` flag, so
the snapshot uses `cloud_validated: null`.
