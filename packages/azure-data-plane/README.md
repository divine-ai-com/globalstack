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
