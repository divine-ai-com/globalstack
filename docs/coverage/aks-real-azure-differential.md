# AKS Real Azure Differential Capture

This differential path records GlobalStack and real Azure AKS request/response behavior for the private-cluster, network-profile, load-balancer, and upgrade constraints that GlobalStack is tightening locally.

It is intentionally guarded and does not run real Azure calls during normal validation.

## Command

Local GlobalStack-only differential:

```bash
GLOBALSTACK_AZURE_CAPTURE_SALT=localcheck \
npm run differential:azure:aks -- --target=globalstack
```

Real Azure validation-only capture:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 \
AZURE_SUBSCRIPTION_ID=... \
npm run aks:capture:differential
```

Single case:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 \
AZURE_SUBSCRIPTION_ID=... \
npm run aks:capture:differential -- --case=private-dns-none-public-fqdn-disabled
```

Provisioning cases are skipped by default. Run them only when the subscription, quota, region, and cleanup plan are explicit:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 \
AZURE_SUBSCRIPTION_ID=... \
npm run aks:capture:differential -- --all --include-provisioning
```

Side-by-side GlobalStack versus real Azure comparison:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 \
AZURE_SUBSCRIPTION_ID=... \
npm run differential:azure:aks -- --target=both --case=invalid-network-plugin --include-provisioning
```

## Current Cases

- `invalid-network-plugin` with `--include-provisioning` because real Azure accepted this request into async cluster creation during the 2026-05-28 differential run.
- `invalid-network-policy`
- `dns-service-ip-outside-service-cidr`
- `private-dns-none-public-fqdn-disabled`
- `agent-pool-orchestrator-above-control-plane`
- `valid-private-public-fqdn-enabled` with `--include-provisioning`

## Outputs

- Sanitized fixtures: `fixtures/azure-captures/aks-metadata.differential.<case>.json`
- Run summary: `dist/differential/azure/aks-metadata/results.json`
- Markdown report: `dist/differential/azure/aks-metadata/report.md`

## Safety Rules

- The script uses `GLOBALSTACK_REAL_AZURE_ACCESS_TOKEN`, `AZURE_ACCESS_TOKEN`, `ARM_ACCESS_TOKEN`, service-principal env vars, or `az account get-access-token`; tokens are never written to fixtures.
- Subscription and tenant IDs are sanitized before fixture write.
- Every real Azure run creates a disposable resource group, deletes it in the same process, and verifies deletion before reporting success.
- Any real Azure run with failed cleanup verification must be treated as a failed run and investigated immediately to avoid billing drift.
- Validation-only is the default. Real cluster provisioning requires `--include-provisioning`.
- A captured fixture is evidence, not a parity claim. Marking behavior `cloudValidated` requires normalization into local conformance and a reviewed local test.

## Open Product Gap

- `invalid-network-plugin`: real Azure accepted the request as `201 Creating` when the runner used a supported Kubernetes version and an allowed VM size. GlobalStack now accepts that request as an async ARM operation and transitions the local operation/resource readback to `Failed` with `InvalidParameter`. A 2026-05-28 `--target=both --case=invalid-network-plugin --include-provisioning --no-fixtures` rerun passed and verified disposable resource-group deletion. The remaining gap is deeper real Azure operation-polling capture for the exact delayed terminal body and any provider-specific cleanup side effects.
