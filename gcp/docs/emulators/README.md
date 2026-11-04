# GCP Emulator Coverage Snapshot

`coverage.json` is generated from:

- the public Google Cloud products catalog
- the official Google Cloud emulator docs we explicitly track
- the public `localgcp` site

Regenerate it with:

```bash
node gcp/scripts/fetch-coverage.mjs
```

The snapshot records:

- a broad Google Cloud product/service catalog baseline from `https://cloud.google.com/products`
- a curated IaC/runtime service inventory for product-planning percentages
- whether the service has tracked official Google emulator support
- whether the service is listed as supported by `localgcp`

This file is landscape input. It is not a GlobalStack support claim.

Use `_meta.catalog_*` values for the broad public-catalog view. Use
`_meta.curated_*` and `curated_iac_runtime_inventory` for product-planning
coverage because that denominator excludes broad marketing, solution, pricing,
learning, and aggregate product-family pages.
