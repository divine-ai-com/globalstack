# Storage Coverage Hardening

This is the working coverage plan for making GlobalStack Azure Storage behavior close to real Azure for IaC-generated deployments.

## Goal

The target is not "storage works locally." The target is that an IaC deployment sees the same management-plane and data-plane accept/reject behavior it would see in Azure for the same request shape and resource state.

This document splits evidence into:

- ARM control-plane behavior captured from real Azure.
- Data-plane behavior exercised against Azurite, the official Microsoft storage emulator.
- Gaps that still require direct real Azure capture.

## Current Evidence

| Area | Local Backing | Current Evidence | Current Claim |
|---|---|---|---|
| Storage account ARM lifecycle | GlobalStack ARM facade | Live Azure lifecycle captures for async create, readiness polling, child pre-ready rejection, delete, and post-delete get. | Azure-derived local expectation coverage for captured states only. |
| Blob container ARM lifecycle | GlobalStack ARM facade | Live Azure lifecycle captures for create/get/list/delete/post-delete plus parent-not-ready rejection. | Azure-derived local expectation coverage for captured states only. |
| Queue ARM lifecycle | GlobalStack ARM facade | Live Azure lifecycle captures for create/get/list/delete/post-delete plus parent-not-ready rejection. | Azure-derived local expectation coverage for captured states only. |
| Table ARM lifecycle | GlobalStack ARM facade | Live Azure lifecycle captures for create/get/list/delete/post-delete plus parent-not-ready rejection. | Azure-derived local expectation coverage for captured states only. |
| File share ARM lifecycle | GlobalStack ARM facade | Live Azure lifecycle captures for create/get/list/delete/post-delete plus parent-not-ready rejection. | Azure-derived local expectation coverage for captured states only. |
| Blob data plane | Azurite | Hardening E2E covers invalid names, duplicate container, missing container/blob, missing blob-type header, missing auth, put/get/list/delete/post-delete. | Official-emulator evidence only; not full Azure parity. |
| Queue data plane | Azurite | Hardening E2E covers invalid names, duplicate create idempotency, missing queue, malformed message, put/peek/list/delete/post-delete. | Official-emulator evidence only; not full Azure parity. |
| Blob/Queue real Azure data plane | Real Azure | Wave 1 captured 32 Blob/Queue cases with cleanup verified. | Live evidence exists for captured cases only; mismatches must be normalized before claims change. |
| Blob/Queue GlobalStack data-plane normalization | Proxy in front of Azurite | Normalizer E2E rewrites three captured Azurite mismatches to real Azure status/error-code behavior. | Implemented only for captured safe mismatches; no broad parity claim. |
| Table data plane | Azurite | Hardening E2E covers invalid names, duplicate table, entity insert/get/delete, duplicate entity conflict, missing auth, and post-delete rejection. | Official-emulator evidence only; not full Azure parity. |
| Azure Files data plane | GlobalStack Azure Files REST-shaped facade | Azure Files parity E2E covers share properties, auth/header rejection, directory creation, file create, range write, read, list, delete, and post-delete not-found. | Local facade evidence only; still needs live Azure capture and SMB/NFS protocol strategy. |

## Implemented Hardening Checks

The storage control-plane parity pack is:

```bash
npm run e2e:storage-parity
```

It exercises auth, missing API version, missing resource group, invalid storage names/SKUs, async readiness, child lifecycle, post-delete errors, and the full eight-platform deployment matrix. See `docs/coverage/storage-parity-pack.md`.

The executable local hardening check is:

```bash
npm run e2e:storage-hardening
```

It writes:

- `dist/e2e/azure-storage-hardening/results.json`
- `dist/e2e/azure-storage-hardening/report.md`

It is now required by:

```bash
npm run smoke
npm run validate
```

The current hardening pack includes Table Storage through Azurite as official-emulator evidence. It verifies table naming rejects, duplicate table creation, entity insert/get/delete, duplicate entity conflict, missing-auth rejection, and post-delete rejection. Table Storage still needs direct real Azure data-plane capture before any stronger parity claim.

## Live Azure Capture Wave 1

The first real Azure data-plane capture wave is:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane
```

It writes:

- `fixtures/azure-storage-data-plane-captures/storage-data-plane-blob-queue-wave-1.json`
- `fixtures/local-expectations/azure-storage-data-plane-expectations.json`
- `docs/coverage/storage-data-plane-wave-1.md`
- `dist/captures/azure-storage-data-plane/storage-data-plane-blob-queue-wave-1.json`

The current fixture contains 32 Blob/Queue cases and has resource group cleanup verified.

Render normalized expectations from the live fixture with:

```bash
npm run storage:expectations
```

The expectation test is:

```bash
node --test packages/conformance/src/azure-storage-data-plane-expectations.test.mjs
```

## Local Normalizer

GlobalStack now has a storage data-plane normalizer that can sit in front of Azurite. It is implemented in:

- `packages/azure-data-plane/src/storage-normalizer.mjs`
- `packages/azure-data-plane/src/storage-proxy.mjs`
- `scripts/e2e/e2e-azure-storage-normalizer.mjs`

Run it with:

```bash
npm run e2e:storage-normalizer
```

The normalizer is intentionally narrow. It only rewrites cases where Wave 1 captured real Azure behavior and Azurite has a deterministic local mismatch:

| Case | Azure | Azurite | GlobalStack behavior |
|---|---|---|---|
| `blob-missing-blob-type-header` | `400 MissingRequiredHeader` | `400` without `x-ms-error-code` | normalized to Azure status/error code |
| `blob-get-without-authorization` | `401 NoAuthenticationInformation` | `403 AuthorizationFailure` | normalized to Azure status/error code |
| `queue-malformed-message` | `400 InvalidXmlDocument` | `400` without `x-ms-error-code` | normalized to Azure status/error code |
| `queue-peek-after-delete` | `200` through the observed stale-read window, then `404 QueueNotFound` | `404 QueueNotFound` immediately | normalized to a bounded Azure stale-read window |

### Wave 1 Azurite Mismatches

| Case | Azure | Azurite | Meaning |
|---|---|---|---|
| `blob-missing-blob-type-header` | `400 MissingRequiredHeader` | `400` without `x-ms-error-code` | Status matches; local error-code parity gap. |
| `blob-get-without-authorization` | `401 NoAuthenticationInformation` | `403 AuthorizationFailure` | Auth failure semantics differ. |
| `queue-malformed-message` | `400 InvalidXmlDocument` | `400` without `x-ms-error-code` | Status matches; local error-code parity gap. |
| `queue-peek-after-delete` | `200` through the observed stale-read window, then `404 QueueNotFound` | `404 QueueNotFound` immediately | Queue delete propagation is eventually consistent in Azure and must be modeled explicitly. |

These mismatches must not be hidden by broad success criteria. The first three are normalized by the GlobalStack storage proxy. `queue-peek-after-delete` is also normalized now, but only as a bounded stale-read window backed by repeat Azure captures: stale `200` was observed through `10000ms`, and `QueueNotFound` was observed by `15000ms`.

## Real Azure Capture Backlog

The following cases should be captured from real Azure before any storage capability is marked `cloudValidated`.

### Blob

- invalid container names: uppercase, too short, leading dash, trailing dash, consecutive dash: captured in wave 1,
- duplicate container create: captured in wave 1,
- create container with duplicate metadata header names,
- put blob into missing container: captured in wave 1,
- get missing blob: captured in wave 1,
- put block blob without `x-ms-blob-type`: captured in wave 1,
- put blob with invalid blob type,
- conditional headers: `If-Match`, `If-None-Match`, lease-required failures,
- delete blob with snapshots or immutable policy where applicable,
- unauthorized request without auth: captured in wave 1,
- wrong-key request,
- SAS denied and expired SAS requests,
- list containers: captured in wave 1,
- blob prefixes and marker pagination.

### Queue

- invalid queue names: uppercase, too short, leading dash, trailing dash, consecutive dash: captured in wave 1,
- duplicate queue create: captured in wave 1,
- missing queue metadata: captured in wave 1,
- malformed XML message body: captured in wave 1,
- message too large,
- visibility timeout bounds,
- TTL bounds,
- pop receipt mismatch,
- delete missing message,
- unauthorized and wrong-key requests,
- list queues: captured in wave 1,
- metadata casing.

### Table

- invalid table names: numeric start, too short, dash, reserved names,
- duplicate table create,
- entity insert conflict,
- entity not found,
- invalid partition/row key characters,
- batch duplicate row,
- batch operation count bounds,
- property type and duplicate-property validation,
- unauthorized and wrong-key requests.

### Azure Files

- invalid share names,
- duplicate share create,
- share quota bounds,
- missing share/directory/file,
- create file with invalid content length,
- range write bounds,
- delete non-empty directory,
- snapshot delete semantics,
- SMB/NFS-specific behavior boundaries.

## Source Notes

Microsoft storage naming and REST docs define the baseline rules used for this plan:

- Container names must be lowercase DNS-style names from 3 through 63 characters, with hyphen placement restrictions.
- Queue names use the same DNS-style 3 through 63 character pattern.
- Table names must be 3 through 63 alphanumeric characters, must start with a letter, and are case-insensitive.
- Azure Storage REST APIs cover Blob, Queue, Table, and File services, while Azurite covers local Blob, Queue, and Table development paths.

## Definition Of Done For Storage Parity Claims

Do not mark storage capabilities `cloudValidated` until:

- every row in the real Azure capture backlog is either captured or explicitly declared out of scope,
- captured responses are normalized into local expectations,
- local replay tests pass,
- Azurite-backed behavior differences are documented,
- cleanup is verified for all real Azure captures,
- `docs/SERVICE-SCOPE.md` and this file are updated.
