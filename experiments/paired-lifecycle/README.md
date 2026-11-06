# Paired native lifecycle pilot

This pilot runs identical Terraform source against GlobalStack and Azure. Its current scope is one empty resource group, including refresh, update, externally injected tag drift, repair, import and destruction. It does not deploy the later Storage or event-driven cases in the [test plan](../../docs/research/globalstack/PAIRED-TEST-PLAN.md).

## Prerequisites

Use Linux x86_64, Node 22.23 or newer, Docker, OpenSSL, curl, and at least 40 GiB free. Build the `globalstack/validation-runner:cli-pinned` image using the [existing validation-image recipe](../../docs/research/globalstack/README.md). The runner resolves that tag to one image ID for both targets and requires Terraform 1.17.1. The lockfile pins AzAPI 2.13.0. The image recipe does not freeze all operating-system dependencies.

Run the safety and comparison regressions first:

```bash
node --test experiments/paired-lifecycle/*.test.mjs
node experiments/paired-lifecycle/run.mjs --target=local
```

For a paired run, provide a private Azure CLI configuration directory that is already authenticated, the exact selected subscription, and the operator-authorized cost ceiling in USD. These are runner inputs, not IaC changes. No credentials belong in this repository.

```bash
export PAIRED_AZURE_CONFIG_DIR=/absolute/private/azure-config
export PAIRED_SUBSCRIPTION_ID=your-subscription-id
export PAIRED_AUTHORIZED_USD=your-authorized-limit
node experiments/paired-lifecycle/run.mjs --target=both
```

The present pilot permits an explicit ceiling up to USD 100. It does not create a billing cutoff. The observer permits writes only to the generated empty resource group and read-only management operation polling. Child-resource creation is denied. No Storage, compute, database, messaging namespace or paid monitoring resource is created. East US is the declared location.

The runner prints a unique ignored report directory. It refuses reuse. To compare a completed or partially failed pair:

```bash
node experiments/paired-lifecycle/compare.mjs /absolute/run/result.json /absolute/run/comparison.json
```

## Observation boundaries

The unchanged native provider uses the normal Azure management hostname. An external HTTPS CONNECT observer routes its ARM calls to the chosen target and records sanitized requests and responses. A run-specific certificate is trusted only by the tool container. Response bytes are forwarded unchanged; differences are not rewritten into compatibility. Only `management.azure.com:443` may be tunneled. Provider initialization downloads occur outside capture.

An external credential adapter supplies the local synthetic identity or an already acquired Azure CLI token. Token acquisition and Entra behavior are not compared by this pilot. The source has no target switch, emulator resource or disabled schema validation. Ordinary deployment inputs differ outside the source. Native ARM traces and explicit drift/read-back probes are recorded separately.

The comparison retains status, body, header and request differences, unmatched exchanges and failures. Request-ID and ETag values vary, but their presence and type remain visible. This pilot does not exercise conditional ETag semantics. A successful lifecycle with protocol differences is not reported as full Azure equivalence.

## Cleanup and retained evidence

Destruction runs after success and failure. A separate watchdog stops the owned tool container and attempts cleanup if the parent exits or the 15-minute live deadline is reached. Fallback deletion checks exact ownership tags and refuses a group containing unexpected resources. Native destruction failure remains a failed lifecycle even when fallback deletion succeeds.

The runner verifies absence before removing tokens, certificates, working providers and state. If cleanup cannot be established, it preserves the private recovery manifest and stops further targets. A host outage can interrupt the watchdog too; recover from that manifest before another live run. Do not archive the `private` directory. Only reviewed `result.json`, `comparison.json` and sanitized logs are candidates for publication.

Preserve failed observations and source revisions when correcting a discrepancy. New results do not replace the released paper sample or establish broad Azure compatibility.
