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
