# Native claims-evidence experiment

This runnable case accompanies the GlobalStack technical draft. It creates a local Azure-shaped deployment with Terraform and verifies Event Grid delivery, Blob reads, Queue messages and a Table ledger. The producer explicitly publishes the event; Blob upload alone does not emit it. The worker is test application code, not an emulated Function App.

All required experiment source is in this repository. `ORIGIN.json` records the private corpus ancestry for attribution; access to that repository is not required. The experiment source is contributed under the root Apache-2.0 license. The Terraform tool image and AzAPI provider retain their own upstream licenses and are fetched separately, not included in the source artifact. No unchanged model-generation result is claimed.

## Prerequisites

Use a Git checkout on Linux x86_64 with Node.js 22.23.0 or newer, compatible npm, Python 3, OpenSSL, Docker with access to its daemon, and at least 40 GiB free. The measured Node version is retained per run. The harness uses Docker host networking and cannot be assumed to work unchanged on Windows or macOS. It needs outbound access for npm, the pinned tool image and provider download. It requires no Azure account, paid API or model subscription.

From the repository root:

```bash
npm ci
npm run research:claims:build
npm run research:claims:test
npm run research:claims
```

The build uses Terraform 1.17.1 from a pinned Linux image digest. The bundle locks AzAPI 2.13.0. The Docker image is a tool dependency, not a distributed GlobalStack runtime image. The script refuses other Terraform versions. Run `git status --short` before the experiment; a result records whether its source was modified.

By default, each run creates a unique directory below ignored `reports/claims-evidence/` and prints that path. To choose a directory, set `CLAIMS_RUN_DIR` to a **new** absolute path. Reusing an existing directory is rejected to preserve previous observations. Verify a completed run with:

```bash
node experiments/claims-evidence/verify.mjs /path/printed/by/the/run/result.json
```

For the study's three repetitions, run the experiment three times and pass all three result paths to the verifier. Repetitions are separate runtimes on the same host, not independent reproductions. The original retained paper sample and the later packaging verification have separate records; do not pool them into a larger sample.

## Checks and interpretation

Each run formats and validates Terraform, runs source assertions, applies the deployment, reads resource/output state, and checks a no-change plan. It executes connected, wrong-destination, restored, missing-subscription, restored, duplicate-subscription and restored episodes. All subscription changes use Terraform. Successful applies for broken configurations do not satisfy the behavioral assertion.

The expected contract and limitations are in [CONTRACT.md](CONTRACT.md). The worker hashes the downloaded evidence bytes and verifies the correlated queue record and ledger. Duplicate Table inserts must return 409 and leave the original entity intact. The worker checks that row on conflict, but intentionally does not deduplicate queue writes: two configured subscriptions must still fail this single-subscription business contract. This is not a production idempotency implementation.

The behavioral entry point requires local context and fails without it. The old management-only test is retained separately for provenance, not counted as the behavioral stage. After native destruction, the harness checks resource and service disappearance, closes listeners and deletes local key material, certificates, provider downloads and Terraform state. It retains the attempt, result, reviewed stage logs and provider lockfile. A failed or incomplete run is evidence to investigate, not a passing fault detection. Disk space is checked before each command; destruction remains allowed below the reserve.

A process or host crash can prevent automatic cleanup. Keep the run directory isolated. Inspect containers named `gs-claims-*` from your own run and remove only those after confirming they are no longer running; do not prune shared caches. Nothing in this experiment deploys to real Azure.

## Research boundaries

This is one first-party local scenario, with three chosen faults. It does not establish Azure parity, security certification, service-wide support, performance or model quality. Event Grid retries, delayed delivery, custom webhook validation, cloud authentication and business deduplication need a separately specified live experiment. Service Bus, Event Hubs, Files and App Configuration are provisioned but outside the observed event path. Queue observation is bounded at 32 messages and ledger checks address one key.

The source is sufficient to run this case, but publication readiness also requires final authorship, independent review and a frozen paper artifact. See [the paper readiness checklist](../../docs/research/globalstack/study/READINESS.md).
