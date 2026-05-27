# Azure Kubernetes Service Runtime Parity Pack

This pack is the current local evidence boundary for the Tier 1 `aks-metadata` capability.

## Scope

- ARM resource types:
  - `Microsoft.ContainerService/managedClusters`
  - `Microsoft.ContainerService/managedClusters/agentPools`
- Captured provider validation preserved for missing `location`, invalid `location`, missing `api-version`, and missing `servicePrincipalProfile`.
- Local ARM success path for managed-cluster create, async provisioning reads, update, get, list, delete, post-delete get, and ARM-template deployment.
- Local action behavior for `listClusterUserCredential`, `listClusterAdminCredential`, `resetServicePrincipalProfile`, `rotateClusterCertificates`, and `upgradeProfiles/default`, including bounded Microsoft Entra-managed user credential formats when local accounts are disabled and old kubeconfig-token rejection after certificate rotation.
- Bounded private-cluster behavior for `apiServerAccessProfile.enablePrivateCluster`, `privateDNSZone: System`, the invalid `privateDNSZone: None` plus disabled public-FQDN combination, private FQDN readback, kubeconfig server host selection, public Kubernetes API host rejection when public FQDN is disabled, and public/private host routing when public FQDN is explicitly re-enabled.
- Bounded CNI/network profile validation and readback for `networkPlugin`, `networkPolicy`, `serviceCidr`, `dnsServiceIP`, and `dockerBridgeCidr`.
- Local ARM child-resource behavior for AKS agent-pool list/get plus child create/delete, VMSS-like pool metadata validation, scale-out, scale-to-zero, bounded autoscaler bounds, bounded node-image upgrade, and parent-cluster pool updates reflected in the live runtime.
- Real local k3s-backed Kubernetes API behavior behind the AKS FQDN for:
  - `/version`
  - namespace list
  - node list
  - backend-RBAC-backed user/admin separation
  - admin write operations for namespace, configmap, secret, deployment, and service creation
  - user write rejection plus secret-read rejection through backend Kubernetes RBAC
- Bounded `LoadBalancer` service exposure through the AKS facade, with:
  - public services receiving Azure-shaped ingress IPs plus optional `*.cloudapp.azure.com` DNS labels that route through the GlobalStack edge router into the live cluster backend
  - `externalTrafficPolicy: Local` honoring only nodes with matching ready local endpoints and surfacing a live `healthCheckNodePort`
  - public services optionally binding to real ARM `Microsoft.Network/publicIPAddresses` resources via AKS service annotations
  - selected Azure service annotations for public-IP resource group, public-IP name, and TCP idle timeout reflected on the edge endpoint metadata used for runtime routing
  - internal services receiving private ingress IPs without public edge exposure
- Bounded Kubernetes `Ingress` host/path routing through the AKS facade for NodePort-backed services, including public edge routing and private/internal ingress isolation.
- Workload preservation when node-pool topology changes through parent updates or child pool create/delete operations.
- Bounded control-plane patch-version update via the concrete k3s backend, including upgrade-profile readback after update and preservation of selected namespace/configmap/deployment/service/ingress workload state.
- Bounded agent-pool node-image upgrade reflects through ARM readback and live Kubernetes node labels.
- Bounded autoscaler runtime behavior for user pools, with a real scale-up from zero on targeted unschedulable workloads and a scale-down back to `minCount` after workload removal.
- Bounded `runCommand` execution via the real local k3s backend.
- All nine platform runner lifecycles execute through the GlobalStack provider path during the full parity run.

## Commands

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:aks-metadata-parity
```

For a faster control-plane-only iteration:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:aks-metadata-parity -- --skip-platforms
```

For guarded real Azure differential captures:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 AZURE_SUBSCRIPTION_ID=... npm run aks:capture:differential
```

## Outputs

- `dist/e2e/azure-aks-metadata-parity/results.json`
- `dist/e2e/azure-aks-metadata-parity/report.md`
- `fixtures/azure-captures/aks-metadata.differential.<case>.json` when the guarded real Azure capture is run

See `docs/coverage/aks-real-azure-differential.md` for the capture cases, provisioning guard, and cleanup contract.

## Claim Boundary

This is local AKS facade plus real local cluster runtime evidence for the enumerated cases only. It is not a 99%-complete or `cloudValidated` claim for Azure Kubernetes Service.

Still explicit gaps:

- Only a bounded VMSS-like node-pool, node-image upgrade, certificate-rotation, autoscaler, private-cluster FQDN, CNI profile validation/readback, ingress-host route, and control-plane patch-version update slice is implemented; real VMSS instance lifecycle, richer autoscaler policies, full CNI datapath behavior, and multi-step upgrade orchestration remain open.
- No Azure-managed load balancer semantics beyond the bounded public/internal, `externalTrafficPolicy: Local`, ARM-public-IP service-exposure, selected annotation metadata, and NodePort-backed ingress slices; addons, maintenance windows, diagnostics, admission controllers, and broader Kubernetes API parity remain open.
- No exact Azure AD / kubelogin / local account / credential rotation / cluster extension fidelity beyond the bounded user/admin, static-token rotation, and managed-identity rejection paths exercised here.
- Exhaustive live Azure parameter variance, async state, retry, identity/RBAC, and provider/IaC edge captures remain required.

Unknown AKS management-plane routes and Kubernetes runtime calls must keep failing closed until reconciled against live Azure behavior or an explicitly documented local contract.
