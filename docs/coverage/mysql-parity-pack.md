# Azure MySQL Flexible Server Parity Pack

This pack is the local acceptance suite for Azure Database for MySQL Flexible Server and database control-plane behavior before the RDS MySQL equivalent moves closer to 99% parity. It does not replace live Azure capture for MySQL protocol behavior, firewall rules, server parameters, backup/restore, HA, maintenance windows, private link, throttling, RBAC, or exact Azure data-plane behavior.

Executable check:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:mysql-parity
```

Use the fast loop while editing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:mysql-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group precondition handling.
- Flexible Server create/get/list/update/delete/post-delete lifecycle.
- Database create/get/list/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid server name, invalid SKU, missing login, missing/weak password, invalid version, invalid database name, and missing database charset/collation.
- Unsupported MySQL child routes, including firewall rules and server configurations, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create MySQL server and database resources.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Database for MySQL control-plane lifecycle, local parameter rejection cases, unsupported MySQL route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean MySQL is `cloudValidated` for SQL protocol behavior, firewall rules, server parameters, backup/restore, HA, maintenance windows, private link, throttling, RBAC, or exact Azure data-plane behavior.
