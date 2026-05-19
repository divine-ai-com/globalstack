# Azure API Management Parity Pack

This pack is the local acceptance suite for API Management service and API metadata behavior before the capability moves closer to 99% parity. It does not replace live Azure capture for the policy engine, products, subscriptions, custom domains, certificates, developer portal, backend credentials, private networking, transforms, quotas, or every management-plane parameter.

## What It Tests

Run:

```bash
npm run e2e:api-management-parity
```

The command writes:

- `dist/e2e/azure-api-management-parity/results.json`
- `dist/e2e/azure-api-management-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| API Management ARM and gateway matrix | Auth rejection, malformed/wrong token rejection, subscription mismatch rejection, missing `api-version`, missing resource group, captured APIM service validation, service/API collection list, documented APIM service/API success shapes, async service provisioning, API create/update/list/delete/post-delete, fail-closed unsupported APIM action, ARM-template deployment, and local gateway host/path/subscription-key route rejection/routing. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:api-management-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The API Management matrix covers these deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- Malformed and wrong bearer tokens fail with `401 InvalidAuthenticationToken`.
- Requests scoped to a different subscription fail with `403 AuthorizationFailed`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a service in a missing resource group fails with `404 ResourceGroupNotFound`.
- Empty APIM service collection lists return `200` with an empty `value` array before create.
- Deleting a missing APIM service returns `204`, matching the local captured delete-not-found policy.
- Empty service bodies fail with captured `400 LocationRequired`.
- Invalid service locations fail with captured `400 InvalidResourceLocation`.
- Service bodies without `sku` preserve the captured `400 InvalidParameters` response.
- Valid APIM service bodies require `sku`, `properties.publisherEmail`, and `properties.publisherName`.
- New services return `201` with async-operation headers, transitional `Creating`, and gateway metadata shaped like `https://<service>.azure-api.net`.
- Operation polling moves the service to `Succeeded`.
- Child APIs require an existing APIM service and `properties.path`.
- Child API collection lists return empty before API create and reject missing parent services.
- API `properties.protocols` must be an array when provided.
- API identifiers reject characters that Azure disallows for APIM API IDs.
- Valid API metadata supports create, update, list, delete, and post-delete `404`.
- Unsupported APIM management actions fail closed instead of returning invented success.
- The local gateway rejects unknown hosts, unknown paths, and missing subscription keys where `subscriptionRequired` is set.
- The local gateway accepts a provided local subscription key for smoke-routing a subscription-required API.
- The local gateway routes a configured API path to an inspection response for integration-test smoke.
- Gateway routes are removed after API/service deletion, and inspection rejects unknown services.
- An ARM-template deployment can create an APIM service and API together through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed API Management control-plane, local gateway smoke, captured validation, and representative platform deployment paths correctly in the local emulator. It does not mean API Management is `cloudValidated` for the full policy engine, products, subscriptions, custom domains, certificates, developer portal, named values, backend credentials, private endpoints, transformations, rate limits, revisions, versions, or quota behavior.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
