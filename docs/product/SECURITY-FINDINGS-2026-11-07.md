# Paired lifecycle security review

The scan at source revision `356645f` reports zero high/critical findings and 28 medium findings. Twenty-six were reviewed with the previous research artifact. Two new medium findings trace the cleanup manifest into Azure requests. This is a maintainer review, not an independent security audit.

## Transport observer

The first PR scan identified a potential server-side request forgery in construction of the upstream URL. The observer now supplies a constant upstream hostname, either `management.azure.com` over verified HTTPS or `127.0.0.1` at the owned local listener. Client input supplies only a validated management path. A loopback target configuration with credentials, another host, a query or a non-root path is rejected. The high-severity finding is absent from the corrected scan; no query was disabled.

CONNECT permits only `management.azure.com:443`. Writes are restricted to the one generated empty resource group. Child-resource creation and other groups are denied. Operation polling is read-only and must match a URL returned in a 202 response from an allowed operation, on the same Azure subscription and management origin. Tests verify rejection before a polling URL is granted, byte-preserving forwarding after it is granted, and rejection of unrelated resource writes.

Bearer credentials are excluded from captured headers. Signed polling URL parameters and opaque operation identifiers are removed from published evidence. The original signed URL remains only in memory while forwarding. The initial private report required this additional sanitization before publication; its original digest and the publication transformation are recorded. Non-JSON responses retain size and a digest rather than arbitrary unreviewed text.

## Recovery manifest requests

Alerts 57 and 58 concern file-derived group/subscription context and the bearer token read by the separate cleanup process. This is the cleanup mechanism's intended operation. The manifest is written by the runner in a mode-0700 directory with mode 0600, before the first native create. It is not a public fixture or untrusted-input interface.

The cleanup URL has a fixed HTTPS Azure management origin. Subscription and generated group syntax are constrained. Redirects are rejected and requests have deadlines. Before fallback deletion, the process verifies the exact run and project tags, confirms an empty child inventory and rejects incomplete pagination. Tests establish that an ownership mismatch or unexpected child prevents deletion. The watchdog stops the owned native container before cleanup so a surviving write cannot recreate a group after an absence check.

Successful verified cleanup removes temporary credentials, certificates, provider working files and Terraform state. An unresolved cleanup preserves the private recovery manifest and blocks further targets. A host outage can interrupt both controller and watchdog; external recovery remains necessary. The runner has no claim of isolation from another process running as the same operating-system user.

The two medium findings remain visible. No severity gate was lowered. The pilot writes no compute, storage, messaging or monitoring resources. Later billable scenarios need their own permitted-resource list, runtime controls and cleanup validation.

## Native platform capture extension

PR 20's complete scan at `7192faabe735d8c4f4b99bc0cb4c52c27a69f748` contains 30 medium findings and zero high or critical findings. Alerts 59 and 60 are additional file-to-HTTP flows in `experiments/platform-lifecycle/cleanup.mjs`: the private recovery manifest supplies the subscription, deployment name and bearer token. Their SARIF source-to-sink paths were reviewed. These findings remain visible; no query or severity threshold is suppressed.

The new helper uses the fixed HTTPS management origin, rejects redirects, validates subscription/run syntax and requires the group name to equal the generated run name. Before deleting anything, template cleanup reads the deployment, verifies its run and group parameters, and waits for a terminal provisioning state. A bounded timeout preserves recovery context instead of deleting a group that an active deployment could recreate. Group cleanup additionally checks ownership and empty inventory. Regression tests cover malformed scope, ownership mismatch, active-deployment timeout, terminal-state ordering, absence checks and credential exclusion from observations.

The extended observer permits only the exact frozen template and parameter combinations at the owned subscription deployment path. Read-only inventory is scoped to the owned group. Compressed capture decoding is bounded to 1 MiB; oversized decoded content retains compressed size and digest instead of being expanded without limit. Forwarded response bytes are unchanged. Tests cover gzip and deflate limits as well as the public ARM authority and scheme.

This runner executes trusted checked-in fixtures. Its containers, shared dependency cache and identity adapter are not a sandbox for hostile IaC. The CLI identity shim does not test Entra authentication. Portal receipts require operator review of actual browser captures and are not independent image attestations. No live matrix execution or Portal screenshot is implied by the nine local captures.
