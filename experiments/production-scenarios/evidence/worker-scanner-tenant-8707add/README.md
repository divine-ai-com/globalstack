# Actual Functions scanner comparison: tenant configuration failure

The original clean `8707add` run returned 200 with a real clean scan on Azure,
but 502 from the local handler. Both targets returned 401 without the Functions
host key. A diagnostic inside the still-running local worker returned 400
`identity_not_found` from its managed-identity endpoint. No workload token or
platform secret is retained.

The harness configured the identity service with the pilot tenant but did not
configure ARM identity creation with that tenant. ARM used its zero-tenant
default. The correction sets one external tenant configuration for both; it
does not relax tenant checks or change the application. A non-default-tenant
local rerun and another paired run are required before claiming resolution.

These events are an interim subset of the original recording. Azure cleanup
is still pending when this snapshot is created. The final run result and
cleanup evidence must be retained separately. No full workflow passed.
