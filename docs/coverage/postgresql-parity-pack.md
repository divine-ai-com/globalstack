# Azure PostgreSQL Flexible Server Parity Pack

This pack is the local acceptance suite for Azure Database for PostgreSQL Flexible Server and database control-plane behavior plus a disposable local PostgreSQL backing-engine smoke before the PostgreSQL capability moves closer to 99% parity. It does not replace live Azure capture for Azure Flexible Server runtime behavior, firewall rules, server parameters, backup/restore, HA, maintenance windows, private link, throttling, RBAC, or exact Azure data-plane behavior.

## Harness

- Script: `scripts/e2e/e2e-azure-postgresql-parity.mjs`
- Command: `npm run e2e:postgresql-parity`
- Output: `dist/e2e/azure-postgresql-parity/results.json`
- Report: `dist/e2e/azure-postgresql-parity/report.md`
- Validation gate: `npm run validate`

## Covered Behaviors

| Area | Coverage | Pass Criteria |
|---|---|---|
| Azure auth boundary | Missing token, malformed token, wrong token, and subscription mismatch. | Requests fail with Azure-shaped auth or authorization errors. |
| Server lifecycle | Flexible Server create, get, update, list, delete, post-delete get, delete-not-found, and missing resource group behavior. | Lifecycle calls persist ARM-shaped state and expose deterministic FQDN metadata. |
| Database lifecycle | Database create, get, list, delete, post-delete get, missing parent, and post-server-delete parent handling. | Child resources require an existing server and preserve Azure-shaped parent errors. |
| Parameter variance | Missing API version, missing location, invalid location, invalid server name, invalid SKU, missing login/password, weak password, invalid version, invalid database name, missing charset, and missing collation. | Invalid inputs fail locally instead of producing invented success. |
| Local PostgreSQL backing | Disposable `postgres:16-alpine` database creation, table creation, insert/select, primary-key rejection, transaction rollback, invalid SQL rejection, unknown-role rejection, and cleanup. | SQL success and failure behavior is backed by a real PostgreSQL engine rather than a mocked response. |
| Unsupported routes | Firewall rule and server configuration routes. | Routes fail closed with `GlobalStackResourceTypeNotEmulated`. |
| IaC path | ARM deployment can create a Flexible Server and database. | Deployment succeeds only through implemented resource types and records deployment steps. |
| Platform runners | Terraform, OpenTofu, Pulumi TS, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON GlobalStack provider lifecycles. | All platform runners complete successfully. |

## Current Claim

Passing this pack means GlobalStack handles the listed Azure PostgreSQL management-plane lifecycle, common parameter rejection cases, local PostgreSQL backing-engine SQL success and failure behavior, unsupported route boundaries, ARM-template deployment path, and platform deployment runners in the local emulator.

It does not mean GlobalStack is cloud-validated for Azure Flexible Server connection policy, Azure firewall semantics, server parameters, backups, PITR, HA, maintenance, private endpoints, identity/RBAC, throttling, or exact Azure service runtime behavior.
