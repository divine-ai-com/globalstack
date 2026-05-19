# Azure Redis Cache Parity Pack

This pack is the local acceptance suite for Azure Cache for Redis control-plane behavior before the ElastiCache Redis equivalent moves closer to 99% parity. It does not replace live Azure capture for Redis protocol behavior, clustering, persistence, firewall rules, private link, TLS/auth edge cases, patching, throttling, RBAC, or exact Azure data-plane behavior.

Executable check:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:redis-parity
```

Use the fast loop while editing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:redis-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group precondition handling.
- Redis cache create/get/list/update/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid name, invalid SKU name, invalid SKU family, invalid capacity, and invalid `enableNonSslPort`.
- Redis endpoint metadata for host name, Redis port, and SSL port.
- Unsupported Redis child routes, including firewall rules and linked servers, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create a Redis cache resource.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Cache for Redis control-plane lifecycle, local parameter rejection cases, unsupported Redis route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Redis is `cloudValidated` for Redis protocol behavior, clustering, persistence, firewall rules, private link, TLS/auth edge cases, patching, throttling, RBAC, or exact Azure data-plane behavior.
