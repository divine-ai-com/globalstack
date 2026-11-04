# Azure WAF Policy Parity Pack

This pack is the local acceptance suite for Azure Application Gateway WAF policies, Azure Front Door WAF policies, Front Door security policies, and bounded live custom-rule enforcement. It does not replace live Azure capture for managed rule execution, bot protection, exclusions, per-rule overrides, throttling, RBAC, or exact Azure edge/runtime behavior.

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
- Resource group, virtual network, public IP, application gateway, and Front Door profile parent precondition handling.
- Application Gateway WAF policy create/get/list/update/delete/post-delete lifecycle.
- Front Door WAF policy create/get/list/delete/post-delete lifecycle.
- Front Door security policy create/get/list/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid resource names, missing policy settings, invalid state, invalid mode, missing managed rule sets, invalid custom rules, missing Front Door security-policy parameters, invalid security-policy type, missing WAF policy IDs, wrong WAF policy resource type, missing domains, and missing URL patterns.
- Local custom-rule evaluation for clean-request allow, prevention-mode block, detection-mode observe-without-blocking, and disabled-policy bypass behavior.
- Live Application Gateway traffic enforcement when a gateway references an Application Gateway WAF policy.
- Live Front Door traffic enforcement when a security policy references a Front Door WAF policy.
- Unsupported WAF child/action routes, including attach action, managed-rules route, and CDN security-policy child route, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create a Front Door WAF policy and Front Door security policy.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure WAF policy control-plane lifecycle, bounded live Application Gateway and Front Door policy attachment behavior, local parameter rejection cases, bounded local custom-rule evaluation, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean WAF is `cloudValidated` for managed rule execution, bot protection, exclusions, per-rule overrides, throttling, RBAC, or exact Azure edge/runtime behavior.
