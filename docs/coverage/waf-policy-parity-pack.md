# Azure WAF Policy Parity Pack

This pack is the local acceptance suite for Azure Application Gateway WAF policies and Azure CDN security policies before the WAF equivalent moves closer to 99% parity. It does not replace live Azure capture for managed rule execution, bot protection, exclusions, per-rule overrides, policy attachment runtime behavior, request blocking/logging semantics, throttling, RBAC, or exact Azure edge/runtime behavior.

Executable check:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:waf-policy-parity
```

Use the fast loop while editing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:waf-policy-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group and CDN profile parent precondition handling.
- Application Gateway WAF policy create/get/list/update/delete/post-delete lifecycle.
- CDN security policy create/get/list/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid resource names, missing policy settings, invalid state, invalid mode, missing managed rule sets, invalid custom rules, missing CDN parameters, invalid security-policy type, missing WAF policy IDs, missing domains, and missing URL patterns.
- Unsupported WAF child/action routes, including attach action, managed-rules route, and CDN security-policy child route, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create an Application Gateway WAF policy and CDN security policy.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure WAF policy control-plane lifecycle, local parameter rejection cases, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean WAF is `cloudValidated` for managed rule execution, bot protection, exclusions, per-rule overrides, policy attachment runtime behavior, request blocking/logging semantics, throttling, RBAC, or exact Azure edge/runtime behavior.
