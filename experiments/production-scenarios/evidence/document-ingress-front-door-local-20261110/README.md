# Local document ingress front-door run

The same document ingress image used by the prior local run was deployed with a
Container App authentication resource. A disposable TLS listener sent client
requests through GlobalStack's Container App router, which verified an app-only
Microsoft Entra token against Microsoft's public signing key. The listener
rejected missing and forged tokens with 401 before forwarding. A valid token
uploaded a clean file and later read and searched the processed document.

The [redacted summary](summary.json) records the observed status codes and
business-state counts. The private run report contains resource IDs and worker
logs and is not published. All local containers were removed. This run did not
deploy the combined stack to Azure, test delegated users, prove private-network
isolation, or exercise the Service Bus failure path. The Search indexer still
reads local Blob state directly, so its successful result is not transport
parity evidence.

The first attempt returned 501 at the front door because GlobalStack rejected
the `api://<application-id>` audience in the deployment policy. The parser now
accepts that bounded audience form; the successful rerun used the unchanged
policy template and application image.
