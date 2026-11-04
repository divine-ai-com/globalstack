# Azure Synapse Warehouse Parity Pack

Command:

```bash
npm run e2e:synapse-warehouse-parity
```

The pack covers the current GlobalStack Azure Synapse Warehouse boundary:

- ARM authentication and subscription mismatch rejection.
- `Microsoft.Synapse/workspaces` create, get, list, update, delete, missing-resource-group, not-found, and ARM-template deployment behavior.
- `Microsoft.Synapse/workspaces/sqlPools` create, get, list, update, delete, parent-missing, not-found, and ARM-template deployment behavior.
- Bounded local SQL runner behavior for registered dedicated SQL pools: table create, duplicate table rejection, inserts, `SELECT COUNT(*)`, `SELECT * ORDER BY`, missing-pool and missing-table rejection, invalid column rejection, unsupported statement rejection, and deleted-pool cleanup.
- Parameter variance for workspace name, identity, default data lake storage, location, SQL pool name, SKU, create mode, and max size.
- Fail-closed unsupported workspace and SQL pool child/action routes such as firewall rules, administrators, and pause.
- Full platform runner matrix when the pack is run without `--skip-platforms`.

Claim boundary:

This pack does not claim full Azure Synapse Analytics parity. The local SQL runner is intentionally limited to representative integration-test behavior around simple table creation, inserts, and selects after the ARM SQL pool exists. Distributed SQL execution, MPP optimization, full T-SQL coverage, pause/resume, workspace networking, private endpoints, firewall enforcement, managed resource groups, data lake integration, RBAC, and exact Azure SQL data-plane behavior remain explicit real-Azure-capture work.
