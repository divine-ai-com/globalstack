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
