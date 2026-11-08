# Native Container Apps pilot runtime

The opt-in `nativeContainerAppProvisioner` runtime option executes an approved
local image when a Container App is deployed through ARM. The separate HTTPS
handler is `runtime.containerAppRouter.handler()`. The normal packaged startup
has not yet been wired to this handler. This implementation has local regression
tests; Azure request/error parity and the complete scanner workflow remain to
be measured.

The Docker provisioner admits one container and one replica, at most two CPUs
and four GiB of memory. It uses an internal network, a read-only root filesystem,
bounded temporary memory, no Linux capabilities and no image pulls. The operator
maps a declared image reference to an existing immutable local image ID. Registry
IAM, image pulls, volumes, secrets, command overrides, multiple revisions,
autoscaling and liveness restarts are not implemented. Unsupported deployment
settings fail provisioning instead of reporting a running worker.

Readiness gates startup and each authorized forwarded request. Configuration
changes replace the process; tags and provider timestamps do not. Deletion
removes the route before disposing the container and network. Cleanup failures
remain owned and visible. Cancellation also disposes a late-starting worker.

The supported ingress mode requires HTTPS, external HTTP ingress, single-revision
routing and app-only Entra authentication. `authConfigs/current` supplies the
audience and both application/client and principal allowlists. Missing auth
configuration and unsupported auth modes return 501. Invalid tokens return 401;
valid callers outside the allowlists return 403. Untrusted platform identity
headers are removed before forwarding. There is no anonymous fallback. Private
network admission and browser login flows remain unsupported.

Signing trust is supplied by the operator, never by an incoming token or ARM
request. A local signing trust may explicitly identify its equivalent configured
issuer with `configurationIssuer`. This permits the unchanged Azure auth module
to target a local identity service without accepting locally signed tokens as
real Entra tokens. Explicit `applicationAudiences` on the local identity service
map `api://<application UUID>` requests to v2 application-audience claims.

These local status codes and the initial readiness behavior are implementation
contracts, not a claim of exact Azure error bodies, probe scheduling or revision
behavior. The paired live deployment must retain and compare those differences.
