# Azure Kubernetes Service Runtime Parity Pack

This pack is the current local evidence boundary for the Tier 1 `aks-metadata` capability.

## Scope

- ARM resource type: `Microsoft.ContainerService/managedClusters`.
- Captured provider validation preserved for missing `location`, invalid `location`, missing `api-version`, and missing `servicePrincipalProfile`.
- Local ARM success path for managed-cluster create, async provisioning reads, update, get, list, delete, post-delete get, and ARM-template deployment.
- Local action metadata for `listClusterUserCredential` and `listClusterAdminCredential`.
- Real local k3s-backed Kubernetes API behavior behind the AKS FQDN for:
  - `/version`
  - namespace list
  - node list
  - admin write operations for namespace, configmap, deployment, and service creation
  - read-only enforcement for cluster user credentials
- Fail-closed behavior for unsupported AKS actions such as `runCommand`.
- All eight platform runner lifecycles execute through the GlobalStack provider path during the full parity run.

## Commands

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:aks-metadata-parity
```

For a faster control-plane-only iteration:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:aks-metadata-parity -- --skip-platforms
```

## Outputs

- `dist/e2e/azure-aks-metadata-parity/results.json`
- `dist/e2e/azure-aks-metadata-parity/report.md`

## Claim Boundary

This is local AKS facade plus real local cluster runtime evidence for the enumerated cases only. It is not a 99%-complete or `cloudValidated` claim for Azure Kubernetes Service.

Still explicit gaps:

- No managed multi-node provisioning, VMSS behavior, CNI, load balancer integration, private clusters, ingress, addons, upgrades, maintenance windows, diagnostics, or autoscaler parity.
- No exact Azure AD/RBAC, local account, runCommand execution, cluster extension, node image, or credential rotation behavior.
- Exhaustive live Azure parameter variance, async state, retry, identity/RBAC, and provider/IaC edge captures remain required.

Unknown AKS management-plane routes and Kubernetes runtime calls must keep failing closed until reconciled against live Azure behavior or an explicitly documented local contract.
