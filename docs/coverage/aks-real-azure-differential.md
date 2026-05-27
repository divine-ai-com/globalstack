# AKS Real Azure Differential Capture

This capture path records real Azure AKS request/response behavior for the private-cluster, network-profile, load-balancer, and upgrade constraints that GlobalStack is tightening locally.

It is intentionally guarded and does not run during normal validation.

## Command

Validation-only capture:

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

## Current Cases

- `invalid-network-plugin`
- `invalid-network-policy`
- `dns-service-ip-outside-service-cidr`
- `private-dns-none-public-fqdn-disabled`
- `agent-pool-orchestrator-above-control-plane`
- `valid-private-public-fqdn-enabled` with `--include-provisioning`

## Outputs

- Sanitized fixtures: `fixtures/azure-captures/aks-metadata.differential.<case>.json`
- Run summary: `dist/captures/azure-aks-differential/results.json`

## Safety Rules

- The script uses ARM bearer tokens from `az account get-access-token`; tokens are never written to fixtures.
- Subscription and tenant IDs are sanitized before fixture write.
- Every run creates a disposable resource group and verifies deletion before reporting success.
- Validation-only is the default. Real cluster provisioning requires `--include-provisioning`.
- A captured fixture is evidence, not a parity claim. Marking behavior `cloudValidated` requires normalization into local conformance and a reviewed local test.
