# Azure Activity Log Audit Parity Pack

Command:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:activity-log-audit-parity
```

The pack covers the current GlobalStack Azure Activity Log Audit boundary:

- ARM authentication and subscription mismatch rejection.
- Event Grid `Microsoft.EventGrid/systemTopics` create, get, list, update, delete, missing-resource-group, not-found, and ARM-template deployment behavior.
- Parameter variance for system topic location, name, source, topic type, and identity shape.
- Captured root-scope `Microsoft.Insights/diagnosticSettings` rejection behavior.
- Fail-closed unsupported audit child/action routes, including system topic event subscriptions, key regeneration, and diagnostic setting child routes.
- Full platform runner matrix when the pack is run without `--skip-platforms`.

Claim boundary:

This pack does not claim full Azure Activity Log parity. Tenant-wide Activity Log query surfaces, diagnostic fanout, Event Grid delivery, immutable storage, Azure Policy integration, RBAC denial matrices, throttling, retry windows, and exact Azure event schemas remain explicit real-Azure-capture work.
