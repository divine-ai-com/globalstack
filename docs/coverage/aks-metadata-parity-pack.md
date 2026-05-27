# Azure Kubernetes Service Runtime Parity Pack

This pack is the current local evidence boundary for the Tier 1 `aks-metadata` capability.

## Scope

- ARM resource types:
  - `Microsoft.ContainerService/managedClusters`
  - `Microsoft.ContainerService/managedClusters/agentPools`
- Captured provider validation preserved for missing `location`, invalid `location`, missing `api-version`, and missing `servicePrincipalProfile`.
- Local ARM success path for managed-cluster create, async provisioning reads, update, get, list, delete, post-delete get, and ARM-template deployment.
- Local action behavior for `listClusterUserCredential` and `listClusterAdminCredential`, including bounded Microsoft Entra-managed user credential formats when local accounts are disabled.
- Local ARM child-resource behavior for AKS agent-pool list/get plus child create/delete, VMSS-like pool metadata validation, scale-out, scale-to-zero, bounded autoscaler bounds, and parent-cluster pool updates reflected in the live runtime.
- Real local k3s-backed Kubernetes API behavior behind the AKS FQDN for:
  - `/version`
  - namespace list
  - node list
  - backend-RBAC-backed user/admin separation
  - admin write operations for namespace, configmap, secret, deployment, and service creation
  - user write rejection plus secret-read rejection through backend Kubernetes RBAC
- Bounded `LoadBalancer` service exposure through the AKS facade, with:
  - public services receiving Azure-shaped ingress IPs plus optional `*.cloudapp.azure.com` DNS labels that route through the GlobalStack edge router into the live cluster backend
  - public services optionally binding to real ARM `Microsoft.Network/publicIPAddresses` resources via AKS service annotations
  - internal services receiving private ingress IPs without public edge exposure
- Workload preservation when node-pool topology changes through parent updates or child pool create/delete operations.
- Bounded autoscaler runtime behavior for user pools, with a real scale-up from zero on targeted unschedulable workloads and a scale-down back to `minCount` after workload removal.
- Bounded `runCommand` execution via the real local k3s backend.
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

- Only a bounded VMSS-like node-pool and autoscaler slice is implemented; real VMSS instance lifecycle, richer autoscaler policies, node image, and upgrade semantics remain open.
- No CNI, Azure-managed load balancer semantics beyond the bounded public/internal and ARM-public-IP service-exposure slice, private clusters, ingress, addons, maintenance windows, diagnostics, or broader Kubernetes API parity.
- No exact Azure AD / kubelogin / local account / credential rotation / cluster extension fidelity beyond the bounded user/admin credential paths exercised here.
- Exhaustive live Azure parameter variance, async state, retry, identity/RBAC, and provider/IaC edge captures remain required.

Unknown AKS management-plane routes and Kubernetes runtime calls must keep failing closed until reconciled against live Azure behavior or an explicitly documented local contract.
