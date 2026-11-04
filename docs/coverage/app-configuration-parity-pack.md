# Azure App Configuration Parity Pack

This pack is the local acceptance suite for Azure App Configuration store control-plane behavior and REST-shaped local key-value data-plane behavior before the SSM Parameter Store equivalent moves closer to 99% parity. It does not replace live Azure capture for full key-value data-plane semantics, feature flags, snapshots, Key Vault references, revision history, refresh tokens, RBAC, private link, throttling, or exact Azure service runtime behavior.

Executable check:

```bash
npm run e2e:app-configuration-parity
```

Use the fast loop while editing:

```bash
npm run e2e:app-configuration-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group precondition handling.
- App Configuration store create/get/list/update/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid store name, missing/invalid SKU, invalid local-auth flag, and invalid public-network mode.
- Endpoint metadata for local App Configuration stores.
- Key-value data-plane behavior for required auth and API version, missing keys, string value validation, tags shape, create/read/update/list/delete, labels, ETag preconditions, If-None-Match, lock/unlock, locked write/delete rejection, unsupported route fail-closed behavior, and post-delete not-found.
- Unsupported App Configuration child/action routes, including key-value, feature-flag, and list-key routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create an App Configuration store.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure App Configuration store control-plane lifecycle, local parameter rejection cases, REST-shaped key-value lifecycle and conditional behavior, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean App Configuration is `cloudValidated` for full key-value data-plane semantics, feature flags, snapshots, Key Vault references, revision history, refresh tokens, RBAC, private link, throttling, or exact Azure service runtime behavior.
