# Azure Control Plane

Owns the GlobalStack Azure management-plane surface.

Key responsibilities:

- Azure-shaped ARM routing
- provider-validation shaping from captured Azure behavior
- fail-closed handling for unsupported resource and action routes

Primary entrypoints live under `src/server.mjs` and `src/provider-validation.mjs`.

## Subscription deployment validation

`POST /subscriptions/{id}/providers/Microsoft.Resources/deployments/{name}/validate`
checks inline template parameters, supported expressions, resource type/name
segments, and nested inline deployments without creating resources or deployment
history. `Template` skips provider name rules. `Provider` and `ProviderNoRbac`
add Search service-name checks. Search name rules also apply to direct PUTs.

This is a limited preflight implementation. It does not verify live quotas, global
name availability, Azure RBAC, Search SKU combinations or all ARM schema rules.
Other providers, linked templates, loops, conditional resources and unsupported
expressions return an explicit 501 validation gap. Successful local validation
returns synchronous HTTP 200, one of the statuses allowed by the
[Azure validation contract](https://learn.microsoft.com/en-us/rest/api/resources/deployments/validate-at-subscription-scope?view=rest-resources-2025-04-01).
Azure can instead return 202 and require polling. The local route does not yet
reproduce that asynchronous path or every response field. A successful preflight
is not evidence that the application deploys or runs successfully.

### Linux hosting plan subset

The `Microsoft.Web/serverfarms` control plane accepts the recorded single-instance
Linux P0v3 (`kind: linux`) and EP1 (`kind: elastic`) shapes, in addition to the
existing Y1 metadata surface. P0v3 reads normalize its tier to `Premium0V3`, as
observed on Azure. Unknown SKU names outside the recognized family syntax return
an App Service `BadRequest` envelope. Unsupported scaling, zones, operating
systems and additional plan configuration return an explicit 501.

The same bounded P0v3/EP1 shapes are accepted by ARM template provider validation.
Local validation does not consult Azure account quota, regional capacity or real
RBAC. This metadata support does not start a native application worker or emulate
the hosted scale controller. Asynchronous timing, read-driven lifecycle progress,
extra diagnostic fields and the full Azure plan response remain differences.
See the retained [Azure-first hosting capture](../../experiments/production-scenarios/evidence/web-hosting-abf979f/).
