# GlobalStack

[![CI](https://github.com/divine-ai-com/globalstack/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/divine-ai-com/globalstack/actions/workflows/ci.yml)

GlobalStack runs a bounded Azure management API locally so you can develop and test infrastructure without creating Azure resources. It also provides adapters for selected local service runtimes.

Status: early development. Supported operations vary by service. Registration of a resource type does not mean complete Azure compatibility. See [service scope](docs/SERVICE-SCOPE.md) and the [conformance model](docs/CONFORMANCE-MODEL.md).

## Run your first example

Install Node.js 22.23 or newer and npm 10.9.9 or newer. Docker and an Azure account are not required for this example.

```bash
git clone https://github.com/divine-ai-com/globalstack.git
cd globalstack
npm ci
npm run demo
```

The demo starts a temporary server on a loopback port, deploys [an ARM template](examples/managed-identity/main.json), checks its resource ID output and managed identity, rejects an unsupported resource, and deletes its resources. It exits with a nonzero status if a check fails.

To keep a local management API running:

```bash
npm start
```

The default endpoint is `http://127.0.0.1:4570`. In another terminal:

```bash
curl --fail http://127.0.0.1:4570/_globalstack/health
GLOBALSTACK_ENDPOINT=http://127.0.0.1:4570 npm run demo
```

Set `GLOBALSTACK_ARM_PORT` to change the port. Stop the server with Ctrl+C. State is currently in memory and is lost on restart. The local management API needs no activation key. Protected resource requests still require the local Azure bearer token, which the demo supplies automatically.

## Run the container

Build the image from this checkout:

```bash
docker build -t globalstack/azure-emulator:local -f templates/emulator/Dockerfile .
docker run --rm -p 127.0.0.1:4570:4566 globalstack/azure-emulator:local
```

Run `GLOBALSTACK_ENDPOINT=http://127.0.0.1:4570 npm run demo` from another terminal. This publishes only the management API. Additional service runtimes and ports need separate configuration.

## What this verifies

The quickstart verifies local management API behavior. It does not start databases, brokers, storage engines or function workers. Those runtimes have separate dependencies and tests. An accepted management resource does not by itself prove that an application can use its data plane.

IaC runners and official emulator integrations are described in the [workspace guide](docs/WORKSPACE-GUIDE.md) and [platform lifecycle runbook](docs/runbooks/PLATFORM-RUNNER-LIFECYCLE.md). Platform compatibility depends on provider version, resource type and operation. The Terraform runner uses AzAPI.

## Development checks

```bash
npm run check:local
npm run demo
```

Local checks require no Azure credentials or model API calls. Tests that start a Kubernetes container require explicit Docker opt-in. Azure captures and complete platform matrices are separate from the local checks.

## Documentation

- [Documentation index](docs/README.md)
- [Start here](docs/START-HERE.md)
- [Conformance model](docs/CONFORMANCE-MODEL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Service scope](docs/SERVICE-SCOPE.md)
- [Contributor runbook](docs/AGENT-RUNBOOK.md)
- [Artifact registry](docs/ARTIFACT-REGISTRY.md)
- [Repository map](docs/REPO-MAP.md)
- [Release readiness](docs/product/OPEN-SOURCE-READINESS.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## License proposal

GlobalStack is licensed under Apache 2.0. See LICENSE. Dependencies and optional Microsoft emulator images retain their own licenses and terms.
