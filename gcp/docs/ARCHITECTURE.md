# GlobalStack GCP Architecture

GCP support starts as an isolated workspace under `gcp/`. Nothing here is a
GlobalStack GCP support claim until it is backed by a real local engine and
conformance evidence.

## Shape

```text
gcp/
  src/
    cli/                 CLI entrypoints
    server/              HTTP/gRPC server lifecycle
    router/              Google API host/path dispatch
    auth/                ADC and token handling
    errors/              Google-shaped error envelopes
    operations/          Long-running operation state
    project-registry/    Project, service, and resource registry
    orchestrator/        Lazy local engine lifecycle
    services/            Service modules
  scripts/
    capture/             Real-GCP capture tools
    cleanup/             Real-GCP cleanup sweepers
    e2e/                 Local/runtime E2E checks
  fixtures/
    captures/            Sanitized real-GCP evidence
    expectations/        Local replay expectations
```

## Service Contract

Each service module must own its runtime contract:

- `service`: route registration and service lifecycle
- `store`: local state, if the service needs state
- `errors`: service-specific Google error shapes
- tests: unit, local conformance, and runtime E2E as support deepens

Runtime-heavy services cannot be marked supported by metadata CRUD alone. They
must use one of these real substrates:

- official Google emulator
- real local engine such as Docker, Postgres, Redis, registry, k3s, or object
  store
- bounded executable runtime with documented limits

## Foundation

The foundation layer is intentionally provider-generic for GCP:

- `auth`: validates ADC/service-account files without printing secrets
- `project-registry`: tracks local projects, enabled services, and resources
- `operations`: models Google long-running operations
- `router`: fails closed for unsupported APIs with Google-shaped errors
- `orchestrator`: starts/stops local engines lazily when a service needs one

## First Bucket

The first bucket is declared but not implemented:

- Cloud Storage
- Pub/Sub
- Firestore
- Datastore mode
- Secret Manager
- Cloud KMS
- Cloud Logging
- Cloud Tasks

Every one currently has support class `unsupported`. The declaration only
records the intended real-engine strategy.

## Promotion Rule

GCP code should remain under `gcp/` until:

- ADC/auth checks pass
- cleanup-first real-GCP capture is proven
- Cloud Storage has real-GCP captures and local replay
- the first runtime-backed service bucket has at least one green Terraform
  lifecycle bundle

Only then should runtime code move into first-class `apps/` and `packages/`
surfaces.
