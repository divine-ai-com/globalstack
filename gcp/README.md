# GlobalStack GCP Workspace

This directory contains the isolated GCP product workspace. Keep GCP work here
until it is mature enough to become first-class product code.

Current contents:

- `docs/ROADMAP.md` defines the GCP expansion plan, support classes, phases,
  and promotion criteria.
- `docs/ARCHITECTURE.md` defines the isolated GCP workspace architecture and
  service contract.
- `scripts/fetch-coverage.mjs` builds the GCP emulator landscape snapshot.
- `scripts/check-credentials.mjs` validates ADC or service-account credentials
  without printing private key or token material.
- `scripts/capture/storage-baseline.mjs` captures real Cloud Storage baseline
  behavior with cleanup-first execution.
- `scripts/cleanup/sweep-real-gcp.mjs` performs dry-run cleanup discovery for
  real-GCP conformance resources through ADC-backed REST calls.
- `docs/emulators/coverage.json` records broad Google Cloud catalog coverage,
  official Google emulator coverage, and `localgcp` coverage.
- `docs/emulators/README.md` explains the snapshot shape and regeneration path.

This directory is intentionally separate from the Azure GlobalStack product
surfaces under `apps/`, `packages/`, `scripts/`, `docs/coverage`, and
`docs/conformance`.

Start with `docs/ROADMAP.md` before adding any GCP runtime or conformance code.
Read `docs/ARCHITECTURE.md` before adding service modules.

## Credentials

Keep GCP credentials outside the repo. ADC is preferred for this workspace. The
default paths are:

```bash
/home/ubuntu/secrets/gcp/globalstack-conformance-sa.json
/home/ubuntu/secrets/gcp/env
```

The JSON path must contain the service-account JSON key itself. If you use ADC,
`/home/ubuntu/secrets/gcp/env` only needs project settings:

```bash
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=us-central1
```

If you want a service-account JSON key instead, put this in
`/home/ubuntu/secrets/gcp/env`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/home/ubuntu/secrets/gcp/globalstack-conformance-sa.json
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_CLOUD_LOCATION=us-central1
```

Check credentials without printing secrets:

```bash
node gcp/scripts/check-credentials.mjs
node gcp/scripts/check-credentials.mjs --adc
node gcp/scripts/check-credentials.mjs --token
```

`--token` is only for service-account JSON credentials. ADC token checks should
use `gcloud auth application-default print-access-token` directly and must not
print the token in logs.

All real-GCP scripts must create resources with a unique run id, clean up in a
`finally` path, and verify that no billable resources remain.

The first successful Cloud Storage baseline capture is documented at
`gcp/docs/services/cloud-storage.md`.

## Local Validation

```bash
cd gcp
npm run validate
```
