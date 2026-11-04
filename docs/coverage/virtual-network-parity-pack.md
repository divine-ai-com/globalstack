# Azure Virtual Network Parity Pack

This pack is the local acceptance suite for Azure Virtual Network, subnet, Private Endpoint, and Private DNS zone control-plane behavior before the Virtual Network capability moves closer to 99% parity. It does not replace live Azure capture for packet routing, NSG evaluation, NAT, route tables, service endpoints, private endpoint approval workflows, DNS resolution, record sets, VNet links, throttling, RBAC, or exact Azure Network data-plane behavior.

## What It Tests

Run:

```bash
npm run e2e:virtual-network-parity
```

The command writes:

- `dist/e2e/azure-virtual-network-parity/results.json`
- `dist/e2e/azure-virtual-network-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Azure Virtual Network control-plane matrix | Auth rejection, malformed/wrong token rejection, subscription mismatch, missing `api-version`, missing resource group, VNet lifecycle, subnet lifecycle, Private Endpoint lifecycle, Private DNS zone async lifecycle, parameter rejection, unsupported Network child/action routes, ARM-template deployment, and post-delete behavior. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:virtual-network-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Azure Virtual Network matrix covers these deployment states:

- ARM requests without a bearer token, with malformed bearer syntax, with the wrong token, or scoped to the wrong subscription are rejected.
- VNet, Private Endpoint, and Private DNS zone create without `api-version` or without an existing resource group fail before state is persisted.
- Empty resource collections return `200` with an empty `value` array before create.
- Deleting missing VNet, Private Endpoint, and Private DNS zone resources returns `204`, matching the local captured delete-not-found policy.
- Empty bodies and invalid locations fail.
- VNets reject missing address prefixes, invalid CIDR prefixes, and subnets without prefixes.
- Private Endpoints reject missing private link connections, missing subnet IDs, missing private link service IDs, and missing group IDs.
- Private DNS zones reject invalid zone names and use an async create/readiness flow locally.
- VNet create, get, update, list, delete, post-delete get, and delete-after-delete behavior are covered.
- Subnet create, get, list, delete, and post-delete get behavior are covered.
- Private Endpoint create, get, update, list, delete, and post-delete get behavior are covered.
- Private DNS zone create, operation status, get, list, delete, and post-delete get behavior are covered.
- Unsupported Network routes such as VNet peerings, Private Endpoint DNS zone groups, and Private DNS record sets fail closed instead of returning invented success.
- An ARM-template deployment can create the network resources through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Network control-plane lifecycle, local parameter rejection cases, unsupported Network route boundaries, async Private DNS zone readiness, and representative platform deployment paths correctly in the local emulator. It does not mean Azure networking is `cloudValidated` for packet routing, NSGs, NAT, route tables, service endpoints, Private Endpoint approval workflows, DNS resolution, record sets, VNet links, throttling, RBAC, or exact Azure Network data-plane behavior.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
