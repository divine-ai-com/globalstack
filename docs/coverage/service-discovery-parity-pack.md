# Azure Service Discovery Parity Pack

Command:

```bash
npm run e2e:service-discovery-parity
```

The pack covers the current GlobalStack Azure Service Discovery boundary:

- ARM authentication, malformed token, wrong token, subscription mismatch, and missing `api-version` rejection.
- `Microsoft.Network/privateDnsZones` async create, operation-status, get, and delete behavior used as the DNS-backed discovery primitive.
- Local Private DNS registry resolution for registered records and NXDOMAIN behavior for missing names.
- `Microsoft.App/managedEnvironments` create, get, list, delete, missing-resource-group, and parameter variance behavior.
- `Microsoft.App/containerApps` create, get, list, update, delete, missing-parent, post-delete, and ARM-template deployment behavior.
- Local Container Apps FQDN registry resolution, missing-service lookup, and unregister-on-delete behavior.
- Parameter variance for location, required containers, required managed environment, and replica scale bounds.
- Fail-closed unsupported Container Apps revisions, auth config, and managed-environment certificate routes.
- Full platform runner matrix when the pack is run without `--skip-platforms`.

Claim boundary:

This pack does not claim full Azure Container Apps or service-discovery parity. DNS propagation, private resolver behavior, revision traffic splitting, health-aware service discovery, Dapr, mTLS, service mesh behavior, custom domains/certificates, and exact Container Apps runtime scheduling remain explicit real-Azure-capture work.
