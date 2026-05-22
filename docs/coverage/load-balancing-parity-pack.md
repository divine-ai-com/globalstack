# Azure Load Balancing Parity Pack

This pack is the local acceptance suite for Azure Application Gateway and Azure Load Balancer control-plane behavior before the load-balancing capability moves closer to 99% parity. It does not replace live Azure capture for packet-level load balancing, TLS termination behavior, health probe state transitions, SNAT, zone behavior, autoscale, connection draining, WAF execution, throttling, RBAC, or exact Azure data-plane behavior.

## Harness

- Script: `scripts/e2e/e2e-azure-load-balancing-parity.mjs`
- Command: `npm run e2e:load-balancing-parity`
- Output: `dist/e2e/azure-load-balancing-parity/results.json`
- Report: `dist/e2e/azure-load-balancing-parity/report.md`
- Validation gate: `npm run validate`

## Covered Behaviors

| Area | Coverage | Pass Criteria |
|---|---|---|
| Azure auth boundary | Missing token, malformed token, wrong token, and subscription mismatch. | Requests fail with Azure-shaped auth or authorization errors. |
| Lifecycle | Application Gateway and Load Balancer create, get, update, list, delete, post-delete get, delete-not-found, and missing resource group behavior. | Lifecycle calls persist ARM-shaped state and preserve expected not-found/delete semantics. |
| Application Gateway validation | SKU, gateway subnet reference, frontend IP configuration, frontend port, backend HTTP settings, HTTP listener, and request routing rule. | Invalid gateway shapes fail locally instead of producing invented success. |
| Load Balancer validation | SKU, frontend IP configuration, backend pool, probe, and load balancing rule. | Invalid load balancer shapes fail locally instead of producing invented success. |
| Unsupported routes | Application Gateway backend health/private endpoint connection routes and Load Balancer child/action routes. | Routes fail closed with `GlobalStackResourceTypeNotEmulated`. |
| IaC path | ARM deployment can create a VNet, Application Gateway, and Load Balancer using the same local ARM facade. | Deployment succeeds only through implemented resource types and records deployment steps. |
| Platform runners | Terraform, OpenTofu, Pulumi TS, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON GlobalStack provider lifecycles. | All platform runners complete successfully. |

## Current Claim

Passing this pack means GlobalStack handles the listed Azure load-balancing management-plane lifecycle, common frontend/listener/backend/probe validation cases, unsupported route boundaries, ARM-template deployment path, and platform deployment runners in the local emulator.

It does not mean GlobalStack is cloud-validated for actual packet forwarding, TLS policy execution, health probe state transitions, SNAT behavior, zone redundancy, WAF inspection, connection draining, private link behavior, autoscale behavior, RBAC, throttling, or Azure edge/runtime behavior.
