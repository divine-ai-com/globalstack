# Native Functions worker development

The runtime accepts an optional `nativeFunctionsProvisioner` operator callback.
For container Function Apps, ARM site changes enqueue worker reconciliation.
Requests return 503 until a native host is bound. Application-setting, image,
plan or identity changes replace the worker. Tag changes retain it. Deletion
cancels pending startup and disposes the container. Cleanup failures remain
visible and prevent replacement. This worker state is separate from ARM
provisioning state; matching Azure asynchronous provisioning remains open.

`createDockerFunctionsProvisioner` supports approved, locally cached Node
Functions images by SHA-256 image ID. The operator maps declared image references
to those IDs and supplies platform identity, network and certificate transport.
It never pulls an image or accepts mounts/networks from ARM. Containers have
memory, CPU and process limits, dropped capabilities and no Docker socket mount.
The controller reads private native host keys, checks actual host readiness and
discovers Event Grid trigger names from the native admin API. These credentials
are removed with the worker. Private files must not be published.

The platform preparation callback owns its allocations and must return an
idempotent disposal callback. Failed preparation must clean partial resources.
This is an opt-in runtime API, not yet a default command-line worker provisioner.
The diagnostic prepares storage and identity transport separately from the ARM
site lifecycle. The deployment-driven platform adapter resolves an existing ARM storage account
and the site identity, then supplies local TLS endpoints and an identity broker.
The `document-worker-local.mjs` diagnostic exercises it with the existing host/app
Bicep templates. Registry credential emulation and a fresh paired Azure result
remain pending. The local image catalog is still trusted operator configuration.

## Local diagnostics

Prerequisite: the locally built `globalstack/document-functions:pilot` image,
Docker, OpenSSL and at least 40 GiB free space. These commands do not contact
Azure or pull images:

```sh
FUNCTIONS_PROBE_HOST_IDENTITY=1 FUNCTIONS_PROBE_IDENTITY=1 \
FUNCTIONS_PROBE_NATIVE_ROUTING=1 FUNCTIONS_PROBE_ORCHESTRATION=1 \
node experiments/production-scenarios/functions-storage-probe.mjs

node experiments/production-scenarios/functions-auto-worker-probe.mjs
```

The first diagnostic uses bearer host storage over verified TLS and expects a
persisted Failed orchestration because business-service settings are absent.
The second records ARM-triggered startup, native trigger discovery, the expected
real handler failure, unchanged and changed configurations, rejection of an
unapproved image, recovery and deletion. An application health response or an
expected negative handler result is not a completed business workflow.

## Worker-to-Container-App transport

`createNativeFunctionsPlatform` accepts operator-selected `containerAppEndpoints`
setting names. Each configured HTTPS origin must resolve to exactly one
ARM-deployed Container App in the workload subscription. The platform supplies
local DNS, verified certificate trust and a transport port. Requests still pass
through the Container App's deployed authentication policy. Unknown, foreign,
ambiguous, credential-bearing and non-HTTPS targets are rejected. This does not
implement Azure private-network isolation or bypass the ingress mode checks.

`node experiments/production-scenarios/worker-scanner-local.mjs` deploys the native
Functions worker and scanner, then executes Azure SDK client commands inside the
worker container. It checks managed-identity acquisition, real scanning, policy
revocation/restoration and rejection of untrusted TLS certificates. These are
container-level SDK calls, not an Event Grid invocation or full document workflow.
The application image contains no emulator branch. The worker template supplies
its user-assigned client ID through `AZURE_CLIENT_ID` and accepts downstream
application settings through a separate array parameter.

To exercise an actual Functions HTTP handler, build the current document image
and set `WORKER_IMAGE_TAG` to that local tag and `WORKER_SCANNER_HTTP=true`.
The optional `scanner-diagnostic` route requires the native Functions host admin
key and is registered only when `SCANNER_DIAGNOSTIC_ENABLED=true`. The runner
checks unauthorized ingress, exact input hashes, scanning, and downstream policy
revocation/restoration. Keys remain private and are removed during cleanup.
This diagnostic is still separate from Event Grid delivery and Durable processing.

## Paired Functions-to-scanner component

`worker-scanner-paired.mjs` deploys the worker and scanner using the existing
Bicep modules. Both targets receive identical compiled templates and published
image digests. The scanner endpoint is supplied from each target's deployment
output. The Functions application has no emulator-specific branch.

Set the existing `PAIRED_SUBSCRIPTION_ID`, `PAIRED_RESOURCE_GROUP`,
`PAIRED_PUBLISHER_OBJECT_ID`, `PAIRED_AZURE_CONFIG_DIR`, and
`PAIRED_AZURE_CERTIFICATE_FILE` externally. Also provide `ENTRA_TENANT_ID`,
`SCANNER_API_AUDIENCE`, `WORKER_IMAGE_ID`, and `SCANNER_IMAGE_ID`. Image IDs must
come from `docker image inspect` of the intended locally cached images. The
worker image must contain the opt-in scanner diagnostic. Never supply secrets
in tracked files.

For the live comparison recording, supply the installed Playwright module and
Chromium paths as `PAIRED_PLAYWRIGHT_MODULE` and `PAIRED_CHROMIUM_EXECUTABLE`, then:

```sh
node experiments/platform-lifecycle/walkthrough.mjs --worker-scanner
```

The harness requires a clean checkout, an empty dedicated operator resource
group, 40 GiB free, and an available USD 11 allocation in the shared experiment
ledger. The allocation is a conservative experiment allowance, not a reading of
Azure billing. A watchdog initiates cleanup after process loss or the bounded
execution deadline. Cleanup verifies ownership on both sides before removing
shared resources, and preserves the operator resource group. Host-key responses
are redacted before recording. Raw private cleanup manifests and Docker login
configuration must not be published.

The component checks host authentication and real clean/YARA-detected scans
through the deployed Functions handler. Matching scan hashes and stable engine
results are required. A pass does not establish Event Grid delivery, Durable
orchestration, database/index updates, private networking, or full workflow
completion. The recording displays live API observations, not Azure Portal.
