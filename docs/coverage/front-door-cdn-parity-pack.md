# Azure Front Door/CDN Parity Pack

This pack is the local acceptance suite for Azure Front Door and Azure CDN profile and endpoint control-plane behavior plus bounded local edge host routing checks before the CloudFront equivalent moves closer to 99% parity. It does not replace live Azure capture for global edge routing, cache invalidation, POP behavior, custom domains, TLS certificate lifecycle, origin health probes, rules engine execution, WAF attachments, throttling, RBAC, or exact Azure edge/runtime behavior.

Executable check:

```bash
npm run e2e:front-door-cdn-parity
```

Use the fast loop while editing:

```bash
npm run e2e:front-door-cdn-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group and profile parent precondition handling.
- CDN profile create/get/list/delete/post-delete lifecycle.
- Front Door endpoint create/get/list/update/delete/post-delete lifecycle.
- CDN endpoint create/get/list/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid resource names, missing/invalid profile SKU, invalid Front Door `enabledState`, missing origins, invalid origin host/port, and invalid HTTP/HTTPS flags.
- Endpoint metadata for local Front Door and CDN host names.
- Local edge host routing for unknown host rejection, Front Door host response metadata, CDN configured-origin response metadata, disabled HTTP rejection, and disabled Front Door endpoint rejection.
- Unsupported CDN child/action routes, including rule-set and purge routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create a profile, Front Door endpoint, and CDN endpoint.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Front Door/CDN control-plane lifecycle, local parameter rejection cases, local edge host/protocol/origin routing checks, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Front Door or CDN is `cloudValidated` for global edge routing, cache invalidation, POP behavior, custom domains, TLS certificate lifecycle, origin health probes, rules engine execution, WAF attachments, throttling, RBAC, or exact Azure edge/runtime behavior.
