# Azure Key Vault Parity Pack

This pack is the local acceptance suite for Key Vault vaults, secrets, and keys before the capability moves closer to 99% parity. It does not replace live Azure capture for complete RBAC, access policies, private endpoints, firewall behavior, managed HSM, certificate surfaces, soft-delete and purge-protection parity, every cryptographic algorithm, key import/export constraints, audit logs, throttling, or every management-plane parameter.

## What It Tests

Run:

```bash
npm run e2e:key-vault-parity
```

The command writes:

- `dist/e2e/azure-key-vault-parity/results.json`
- `dist/e2e/azure-key-vault-parity/report.md`

By default it runs two layers:

| Layer | Scope | Required Result |
|---|---|---|
| Key Vault ARM and data-plane matrix | Auth rejection, malformed bearer rejection, missing/unsupported `api-version`, missing resource group, captured vault validation, missing-parent key/secret rejection, ARM vault/secret/key create/update/list/delete boundaries, local secret version data plane, local RSA key create/get/list/encrypt/decrypt/delete with `key_ops` enforcement, fail-closed unsupported actions, and ARM-template deployment. | Every enumerated positive and negative case passes with Azure-shaped status and error expectations. |
| Platform runner matrix | Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Bicep, and ARM JSON deploy through the GlobalStack provider path. | Every platform reaches `destroy` with `PASS` and a `Succeeded` ARM deployment response. |

Use `npm run e2e:key-vault-parity -- --skip-platforms` only for tight local debugging. `npm run validate` requires the platform matrix.

## Current Local Coverage

The Key Vault matrix covers these deployment states:

- A request without a bearer token fails with `401 InvalidAuthenticationToken`.
- A provider request without `api-version` fails with `400 MissingApiVersionParameter`.
- Creating a vault in a missing resource group fails with `404 ResourceGroupNotFound`.
- Empty vault bodies fail with captured `400 LocationRequired`.
- Invalid vault locations fail with captured `400 InvalidResourceLocation`.
- Invalid vault names, missing `tenantId`, invalid SKU, and non-array `accessPolicies` fail closed with `400 BadParameter`.
- Vault create/update/get/list succeeds with generated `https://<vault>.vault.azure.net/` metadata.
- Secret and key ARM child creates preserve captured `404 ParentResourceNotFound` when the vault is missing.
- ARM secret resources require `properties.value`, and ARM key resources require `properties.kty` plus valid key options.
- ARM child delete for keys and secrets preserves captured `405 DeleteNotSupported`; data-plane delete is tested separately.
- The local data plane requires bearer auth and `api-version=7.4` or `7.5`.
- Local data-plane secrets support set, latest get, explicit version get, version list, invalid value/content type/tags rejection, delete, and post-delete `SecretNotFound`.
- Local data-plane RSA keys support create, get, list, `key_ops` enforcement, encrypt, decrypt, bad ciphertext rejection, delete, and post-delete `KeyNotFound`.
- Unsupported local secret actions fail closed instead of returning success for unimplemented soft-delete/recover/purge behavior.
- An ARM-template deployment can create the vault, one secret, and one key together through the GlobalStack ARM deployment endpoint.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Key Vault control-plane, local secret/key data-plane smoke, captured validation, and representative platform deployment paths correctly in the local emulator. It does not mean Key Vault is `cloudValidated` for exact access-policy/RBAC enforcement, private networking, firewall bypasses, managed HSM, certificates, soft-delete retention, purge protection, recover/purge operations, import/export restrictions, every crypto algorithm, audit log semantics, throttling, replication behavior, or every live Azure validation edge.

Promote behavior from this pack into a stronger claim only when there is cleanup-verified Azure evidence, official documentation-backed behavior with tests and a caveat, or an explicit out-of-scope declaration.
