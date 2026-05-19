# Azure App Configuration Parity Pack

This pack is the local acceptance suite for Azure App Configuration store control-plane behavior before the SSM Parameter Store equivalent moves closer to 99% parity. It does not replace live Azure capture for key-value data-plane semantics, labels, feature flags, snapshots, Key Vault references, revision history, refresh tokens, RBAC, private link, throttling, or exact Azure service runtime behavior.

Executable check:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:app-configuration-parity
```

Use the fast loop while editing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:app-configuration-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group precondition handling.
- App Configuration store create/get/list/update/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid store name, missing/invalid SKU, invalid local-auth flag, and invalid public-network mode.
- Endpoint metadata for local App Configuration stores.
- Unsupported App Configuration child/action routes, including key-value, feature-flag, and list-key routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create an App Configuration store.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure App Configuration store control-plane lifecycle, local parameter rejection cases, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean App Configuration is `cloudValidated` for key-value data-plane semantics, labels, feature flags, snapshots, Key Vault references, revision history, refresh tokens, RBAC, private link, throttling, or exact Azure service runtime behavior.
