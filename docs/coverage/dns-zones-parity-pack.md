# Azure DNS Zones Parity Pack

This pack is the local acceptance suite for Azure DNS, Private DNS zones, public/private record sets, and Private DNS virtual network link control-plane behavior before the DNS capability moves closer to 99% parity. It does not replace live Azure capture for authoritative DNS serving, recursive resolution, delegation propagation, DNSSEC, traffic routing, health checks, resolver policies, throttling, RBAC, or exact Azure DNS data-plane behavior.

## Harness

- Script: `scripts/e2e/e2e-azure-dns-zones-parity.mjs`
- Command: `npm run e2e:dns-zones-parity`
- Output: `dist/e2e/azure-dns-zones-parity/results.json`
- Report: `dist/e2e/azure-dns-zones-parity/report.md`
- Validation gate: `npm run validate`

## Covered Behaviors

| Area | Coverage | Pass Criteria |
|---|---|---|
| Azure auth boundary | Missing token, malformed token, wrong token, and subscription mismatch. | Requests fail with Azure-shaped auth or authorization errors. |
| Zone lifecycle | Public DNS zone and Private DNS zone create, get, list, delete, missing resource group, post-delete get, and delete-not-found behavior. | Lifecycle calls persist ARM-shaped state and preserve expected not-found/delete semantics. |
| Record-set lifecycle | Public A, AAAA, CAA, CNAME, MX, NS, PTR, SOA, SRV, and TXT records plus private A, AAAA, CNAME, MX, PTR, SOA, SRV, and TXT records. | Each implemented record type can be created with real Azure-shaped resource type paths and listed/read where applicable. |
| Parameter variance | Missing API version, empty body, invalid zone name, invalid location, non-global location, missing TTL, invalid TTL, invalid IPv4/IPv6, malformed CNAME/TXT/MX, and invalid relative record name. | Invalid inputs fail locally instead of producing invented success. |
| Private DNS link | Virtual network creation, private DNS virtual network link create/get/list/delete, missing VNet reference, and invalid registration flag. | Link metadata must contain an Azure-shaped virtual network reference and boolean registration setting. |
| Unsupported routes | Unsupported public DNS record type and Private DNS resolver policy route. | Routes fail closed with `GlobalStackResourceTypeNotEmulated`. |
| IaC path | ARM deployment can create public zone, public A record, virtual network, private zone, private A record, and private DNS VNet link. | Deployment succeeds only through implemented resource types and records deployment steps. |
| Platform runners | Terraform, OpenTofu, Pulumi TS, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON GlobalStack provider lifecycles. | All platform runners complete successfully. |

## Current Claim

Passing this pack means GlobalStack handles the listed Azure DNS and Private DNS management-plane lifecycle, common record-set validation cases, Private DNS VNet link metadata, unsupported DNS route boundaries, ARM-template deployment path, and platform deployment runners in the local emulator.

It does not mean GlobalStack is cloud-validated for DNS resolution behavior, public delegation, private resolver forwarding, VNet link conflict semantics, DNSSEC, health checks, weighted/failover routing, RBAC, throttling, or Azure edge propagation delays.
