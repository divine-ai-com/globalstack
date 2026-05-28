# Azure Database Migration Service Parity Pack

Command:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:database-migration-service-parity
```

The pack covers the current GlobalStack Azure Database Migration Service boundary:

- ARM authentication rejection and resource group prerequisite behavior.
- `Microsoft.DataMigration/services` and `Microsoft.DataMigration/services/projects` create behavior with local runtime registration.
- `Microsoft.DataMigration/services/projects/tasks` create/get/list behavior for supported task types.
- Runtime-backed MySQL/PostgreSQL source and target connection checks against real local database containers.
- Runtime-backed user-table discovery against real local MySQL/PostgreSQL tables.
- Bounded selected-table migration for `Migrate.MySql.AzureDbForMySql`, `Migrate.MySql.AzureDbForMySql.Sync`, and `Migrate.PostgreSql.AzureDbForPostgreSql.SyncV2` task shapes.
- Failed terminal task readback for invalid source credentials with an Azure-shaped task error.
- Task command routing for an existing task resource.
- Fail-closed unsupported service actions and unsupported task types.
- Full platform runner matrix when the pack is run without `--skip-platforms`.

Claim boundary:

This pack does not claim full Azure Database Migration Service parity. Live CDC, online cutover, schema conversion, full task execution state machines, network tunnel behavior, advanced source/target authentication modes, retry timing, and exact Azure DMS runtime failures remain explicit real-Azure-capture work.
