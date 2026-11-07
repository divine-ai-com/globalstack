# Azure Data Plane

Owns local Azure data-plane adapters and bounded runtime facades.

Key responsibilities:

- official-emulator wiring where available
- local bounded data-plane routers where GlobalStack claims support
- service-specific runtime helpers used by parity packs

Source lives under `src/`.

## Search and API Management startup

`npm run hybrid:emulator` starts Search and API Management listeners along with
the existing routers. ARM resource create/update/delete operations synchronize
the runtime. Updating a service preserves its existing indexes or APIs.
`npm start` remains the smaller management-only entrypoint.

API Management forwards HTTP/1 requests for configured API operations to the
API's `serviceUrl`. It preserves payload bytes, method, query parameters and
backend status/body, removes hop-by-hop headers, and returns redirects without
following them. Operations support literal paths, whole-segment parameters,
wildcards and required query parameters. Missing operations are rejected.
The default local limits are 8 MiB per request, 32 MiB per response and a
30-second total backend deadline. These are local operational limits, not Azure
tier limits. Connection failures and timeouts cannot become successful metadata
responses.

This is not full APIM policy support. JWT validation, subscription lifecycle,
policy inheritance/transforms, rate limiting, custom certificates, WebSockets
and Azure error-body fidelity still require implementation or live comparison.
The existing subscription-key presence check is a local facade, not a validated
authorization boundary. Operator-supplied backend URLs can access the host's
network; restrict egress and use trusted configuration. No redirect is followed
automatically and URL-embedded backend credentials are rejected.

The process-level regression starts the ordinary emulator entrypoint, deploys
resources over ARM, indexes a document, delivers a correlated request to an
actual HTTP backend, breaks/restores its URL, and checks deletion. This is a
local component flow, not completion of either production application scenario.

## Bounded Search query evaluation

The local query evaluator supports plain token matching, `searchMode`,
`searchFields`, full-query fuzzy terms with zero to two edits, pagination,
retrievable-field projection and requested result counts. Fuzzy terms support
adjacent transpositions and at most 50 dictionary expansions. It uses a simple
Unicode tokenizer, not Azure's complete analyzer/Lucene implementation. Plain
text scores are constant; BM25 ranking, language analyzers, phrases, Boolean
syntax, wildcard expressions and fielded syntax are not implemented.

One explicit vector query against one cosine field runs an exhaustive nearest
neighbor calculation with the configured dimensions and requested `k`. Scores
use `1 / (2 - cosineSimilarity)`. It does not model HNSW graph construction,
approximate recall or Azure performance. Hybrid fusion, semantic ranking,
integrated vectorization and additional query options return an explicit 501
until implemented. Unsupported options must not silently become successful
unfiltered or unrelated result sets. These limits remain gaps for the complete
document and financial research scenarios.

The initial local bounds are 32 query terms, 255 characters per term, 50 default
results and 1,000 maximum results per page. They are operational limits, not
claims about the full Azure service. Sources:
[fuzzy queries](https://learn.microsoft.com/en-us/azure/search/search-query-fuzzy),
[vector ranking](https://learn.microsoft.com/en-us/azure/search/vector-search-ranking),
and [Search REST parameters](https://learn.microsoft.com/en-us/rest/api/searchservice/documents/search-post?view=rest-searchservice-2024-07-01).

## Native Functions worker binding

The emulator can route a registered ARM Function App to an externally managed
native Functions host. Set `GLOBALSTACK_FUNCTIONS_WORKERS_FILE` to an operator
JSON file before starting `apps/emulator/server.mjs`:

```json
[
  {
    "appResourceId": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/example/providers/Microsoft.Web/sites/example-worker",
    "origin": "http://127.0.0.1:8080"
  }
]
```

Use the actual site ID and worker address. This is emulator configuration, not
an application setting or an IaC branch. Origins must use loopback or private
IP addresses and contain no credentials, path, query or fragment. The operator
starts and configures the worker separately. ARM site creation enables routing;
site deletion removes routing but does not own or terminate that worker.

For a bound site, HTTP and Durable requests reach the native host with their
body, application hostname and authentication headers. Host responses are
returned with a fixed allowlist of HTTP, authentication, tracing, CORS and security
headers. Custom response headers outside that list are not forwarded.
Authentication failures are preserved. Redirects are not followed.
Requests are bounded to 12 MiB and 120 seconds. Unavailable workers return 502;
timeouts return 504. These failures never fall back to the metadata simulation.
SCM package deployment and individual function key management return 501 for
bound sites because those native management paths are not implemented. Host key
listing can use the native management API as described below. Unbound sites retain the existing metadata simulation.

This binding does not provide automatic container provisioning, package
installation, app-setting synchronization, Azure managed identity, scaling,
restart durability or full Azure Functions parity. The native host probe uses
GlobalStack Storage and can exercise real Durable execution. Its intentionally
missing downstream service settings produce a failed orchestration, not a
completed document pipeline. See [issue #26](https://github.com/divine-ai-com/globalstack/issues/26).


For native `POST {siteId}/host/default/listKeys`, add `masterKeyFile` to the
binding. It must be an absolute path to a private file (mode 0600 or stricter)
containing the native host's current master key. The credential is read for each
lookup. The emulator checks it against the native host, reads the host function
and system keys, and returns the ARM host-key shape with `Cache-Control: no-store`.
It does not generate replacement keys. Missing configuration returns 501;
unavailable hosts, refused credentials, unsafe file permissions, malformed
responses or redirects return 502 without returning cached keys. Responses are
bounded to 64 KiB and each native request has a ten-second deadline. Key creation,
rotation, deletion and individual function-key listing remain unsupported.

The master key file is operator-owned configuration. It is never part of IaC,
application artifacts, logs or committed evidence. Protect access to the local
ARM endpoint because a successful host-key listing intentionally returns secrets.
The probe creates this file privately and removes it during cleanup. Host
management routes and key scopes follow Microsoft's [host API](https://github.com/Azure/azure-functions-host/blob/dev/src/WebJobs.Script.WebHost/Controllers/KeysController.cs)
and [Functions key documentation](https://learn.microsoft.com/en-us/azure/azure-functions/function-keys-how-to).

### Blob token authorization

`GLOBALSTACK_STORAGE_TOKEN_TRUSTS_FILE` optionally names a JSON array of operator-controlled trust entries. Each entry requires `issuer` (an HTTPS issuer identifier), `tenantId`, `subscriptionIds`, and `jwks.keys`. Keys must be public RSA signing JWKs with unique `kid` values, `alg: RS256`, `use: sig`, and at least 2048-bit moduli. Private key fields are rejected. No remote discovery or token-supplied key URL is followed. The runtime API accepts the same array as `storageTokenTrusts`.

Blob requests validate the token signature, issuer, storage audience, tenant, principal UUID, and required `iat`, `nbf`, and `exp` timestamps. Trust is restricted to the configured subscriptions. Successful authentication still requires a currently deployed Storage Blob Data Reader, Contributor, or Owner assignment at an applicable scope. Container-scoped assignments cannot access sibling containers. Removing an assignment takes effect on the next request, including requests using cached tokens. Unsupported conditional assignments do not grant access.

The supported permission mapping covers existing Blob and container read, list, write, metadata, lease, and delete operations. Reader assignments grant only reads and lists. Unknown operations fail closed. Group membership, custom roles, deny assignments, ADLS ACLs, account-specific token audiences, and Azure role propagation timing are not modeled by this path. Storage Blob Data Owner supports the implemented operations, not unimplemented ADLS ownership operations. This is local authorization support, not Entra federation or a complete network-isolation model. Shared Key and SAS remain separate paths.

The SDK integration test uses `DefaultAzureCredential` against a loopback App Service identity protocol fixture, actual signed tokens, certificate-verified HTTPS Blob requests, and the unchanged document source adapter. It verifies historical bytes and role revocation. The fixture supplies identity and transport configuration externally; automatic worker identity provisioning and paired Azure authorization measurements remain pending. It does not establish either full production scenario as passed.

Contract references: [Microsoft Entra authorization for Storage REST](https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-azure-active-directory), [built-in Storage roles](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/storage).

### Blob download ranges

Current and historical Blob downloads support bounded and open-ended byte ranges, `x-ms-range` precedence, HTTP 206 with the selected bytes, HTTP 416 past the end, and requested MD5 integrity checksums up to 4 MiB. The standard-header fallback for malformed, reversed and suffix ranges follows the retained Azure capture. Multiple ranges return 400. Unknown custom-header syntax and CRC64 requests remain explicitly unsupported.

The range regression compares response status, successful bytes and selected headers against `experiments/production-scenarios/evidence/blob-ranges-before-d3e3ead`. This capture contains both Azure and the pre-fix GlobalStack responses and verifies account/group cleanup. One known difference remains: integer-overflow ranges receive Azure front-end HTML, while GlobalStack returns XML `InvalidHeaderValue` with the same HTTP 400 status. This is a measured component contract, not complete Blob protocol parity.

### Storage events to native Functions

Storage system-topic subscriptions can target an existing `Microsoft.Web/sites/functions` resource with an Event Grid trigger and an operator-bound native worker. The destination uses the standard `AzureFunction` resource-ID shape. Blob writes generate the event from the actual stored bytes and ETag; subject and event-type filters control delivery. The router reads the native host's Event Grid system key and posts to its real Event Grid webhook. Request bodies cannot select a network origin, redirects are rejected, and keys are excluded from delivery diagnostics.

Delivery records an accepted HTTP response separately from any business workflow result. Failures retain the same event ID through bounded retries; the local implementation permits at most eight concurrent native deliveries. Removing a subscription prevents subsequent delivery, and runtime disposal cancels pending requests. Function batching, identity-based Event Grid delivery, private-endpoint networking, persistent retry state, dead lettering, and Azure retry timing/status-specific policy remain unsupported. This path requires explicitly registered function metadata and does not yet discover functions from an installed package.

Run the native component diagnostic with `FUNCTIONS_PROBE_NATIVE_ROUTING=1 FUNCTIONS_PROBE_ORCHESTRATION=1 FUNCTIONS_PROBE_NATIVE_EVENTS=1 node experiments/production-scenarios/functions-storage-probe.mjs`. Its application settings are intentionally incomplete: a real function failure is expected and is not a passed document scenario. Protocol reference: [Event Grid triggers in Azure Functions](https://learn.microsoft.com/en-us/azure/azure-functions/event-grid-how-tos).

### Local managed identity service

`createManagedIdentityService` in `managed-identity-service.mjs` provides a
bounded App Service token endpoint for operator-bound local workloads. It uses
the live resource store to resolve system identities and attached user
identities. The operator supplies a tenant, permitted subscriptions and resource
audiences. The default audience is Azure Storage. Unsupported audiences return
501 instead of issuing an unrestricted token.

After creating the ARM site, call `service.bind(siteId)` and serve the returned
`handler` on an isolated workload-network listener. Inject that listener's
`/MSI/token` URL as `IDENTITY_ENDPOINT` and the binding's `identityHeader` as
`IDENTITY_HEADER` into the worker environment. Never publish this endpoint or
put the header in application code, reports or ARM outputs. Pass `service.trust`
to the Blob router's token trusts. The application can use the normal Azure SDK
credential chain. The signing key is generated in memory and is not exported.

Bindings use independent random headers. Rebinding rotates the header and
revokes the previous handler. Identity removal or resource deletion prevents new
token issuance. Call `revoke()` when a worker stops and `dispose()` when its local
platform stops. Already issued tokens remain valid until expiry unless the data
plane denies their permissions. The default lifetime is five minutes.

The endpoint implements `GET /MSI/token`, API version `2019-08-01`, and explicit
user selection through `client_id`, `principal_id`, `object_id` or `mi_res_id`.
It checks current attachments rather than trusting a caller-supplied principal.
It follows the [documented App Service request shape](https://learn.microsoft.com/en-us/azure/app-service/overview-managed-identity#rest-endpoint-reference).
Its error envelopes, timing, identity cache and claims are not a measured Entra
replica. It does not federate with Azure, implement app roles or group claims,
provision containers, or configure their network automatically. The resource
store's identity lifecycle also needs paired testing before a broader claim.

### Key Vault workload secret reads

`keyVaultTokenTrusts` on the emulator runtime, or
`GLOBALSTACK_KEY_VAULT_TOKEN_TRUSTS_FILE` on the application server, enables signed
workload authentication for Key Vault. It uses the same pinned-key trust schema
as Blob storage, with the `https://vault.azure.net` audience. When enabled, the
legacy local tokens and inspection routes cannot authorize secret access.

The bounded permission path supports GET of a named secret or its explicit
version using the deployed Key Vault Secrets User role. The vault must explicitly
use RBAC. Secret, vault and ancestor scopes are checked against the current ARM
role assignments. Wrong issuer, signature, audience or tenant is denied. Role
removal takes effect for subsequent requests, including a cached access token.
The role ID follows the [Azure RBAC definition](https://learn.microsoft.com/en-us/azure/role-based-access-control/built-in-roles/security#key-vault-secrets-user).

Secret listing, mutations, keys, other roles, legacy access policies and private
network authorization are not implemented for workload tokens. Unsupported
operations and network configurations return 501. Conditional role assignments
cannot grant access. This feature does not claim Azure error-message, permission
propagation, private endpoint or complete Key Vault parity. Paired Azure testing
and the full document workflow are still required.
