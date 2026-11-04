# Azure Identity And RBAC Parity Pack

This pack is the local acceptance suite for Microsoft Entra ID token facade, Azure Managed Identity metadata, and Azure RBAC request-shape behavior before the capability moves closer to 99% parity. It does not replace live Azure capture for full OAuth flows, token claims, role assignment success, custom role creation, deny assignments, conditional access, Microsoft Graph, managed identity endpoint behavior, propagation delays, or exact authorization decisions.

## What It Tests

Run:

```bash
npm run e2e:identity-rbac-parity
```

The command writes:

- `dist/e2e/azure-identity-rbac-parity/results.json`
- `dist/e2e/azure-identity-rbac-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Identity/RBAC control and token matrix | OpenID discovery, JWKS discovery, local token issuance/rejection, ARM auth rejection, subscription mismatch, Managed Identity lifecycle, captured RBAC create rejection, RBAC not-found/delete-not-found behavior, unsupported Managed Identity action fail-closed behavior, and ARM-template deployment. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:identity-rbac-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Identity/RBAC matrix covers these deployment states:

- OpenID discovery returns a local token endpoint and RBAC URL for the configured tenant.
- JWKS discovery returns a deterministic empty key set for the local token facade.
- Token requests reject missing credentials, wrong client secrets, unsupported grants, and unknown tenants.
- Valid local client-credentials token requests return the deterministic local bearer token.
- ARM requests without a bearer token, with malformed bearer syntax, with the wrong token, or scoped to the wrong subscription are rejected.
- Missing `api-version` is rejected before Managed Identity create.
- Creating a user-assigned managed identity in a missing resource group fails with `404 ResourceGroupNotFound`.
- Managed Identity collection list, create, get, update, delete, post-delete get, post-delete list, and delete-after-delete behavior are covered.
- Empty Managed Identity bodies fail with `400 LocationRequired`.
- Invalid Managed Identity locations fail with `400 InvalidResourceLocation`.
- Unsupported Managed Identity actions fail closed instead of returning invented success.
- Role assignment collection reads and gets preserve the current captured `RoleAssignmentNotFound` behavior.
- Role assignment empty and populated create requests preserve captured validation rejection instead of claiming success.
- Role definition collection reads and gets preserve the current captured `RoleDefinitionDoesNotExist` behavior.
- Role definition empty and populated create requests preserve captured validation rejection instead of claiming success.
- Missing role assignment and role definition deletes return `204`, matching the local captured delete-not-found policy.
- An ARM-template deployment can create a user-assigned managed identity through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed local token service, OpenID discovery, Managed Identity control-plane lifecycle, captured RBAC rejection cases, and representative platform deployment paths correctly in the local emulator. It does not mean identity/RBAC is `cloudValidated` for full Microsoft Entra ID, OAuth authorization/device/code flows, JWT signing claims, Microsoft Graph, role assignment success, custom role definition success, deny assignments, conditional access, propagation delays, managed identity data-plane endpoint behavior, or exact authorization decisions.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
