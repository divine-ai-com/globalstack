# Azure Database Migration Service Parity Pack

Command:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:database-migration-service-parity
```

The pack covers the current GlobalStack Azure Database Migration Service boundary:

- ARM authentication and subscription mismatch rejection.
- `Microsoft.DataMigration/services` create, get, list, update, delete, missing-resource-group, not-found, and ARM-template deployment behavior.
- `Microsoft.DataMigration/services/projects` create, get, list, update, delete, parent-missing, not-found, and ARM-template deployment behavior.
- Local migration task state checks for missing projects, incomplete task rejection, assessment start, migration completion, and duplicate completion rejection.
- Parameter variance for service name, SKU, public network access, project name, source/target platform, and connection-info shape.
- Fail-closed unsupported service actions and project task routes.
- Full platform runner matrix when the pack is run without `--skip-platforms`.

Claim boundary:

This pack does not claim full Azure Database Migration Service parity. Live CDC, schema conversion, full task execution state machines, network tunnel behavior, source/target authentication, retry timing, and exact Azure DMS runtime failures remain explicit real-Azure-capture work.
