# Platform Runner Lifecycle

This document tracks the Azure platform runner lifecycle used to validate generated IaC tasks against the GlobalStack Azure sidecar.

## Lifecycle Contract

All platform runners execute the same stage sequence:

1. `build`
2. `lint`
3. `unit-tests`
4. `deploy`
5. `provider-lifecycle`
6. `integration-tests`
7. `destroy`

Local smoke runs need no activation key. Azure-shaped requests use the local Azure identity. Runner containers resolve the target provider from task `metadata.json` first, then `PROVIDER` / `CLOUD_PROVIDER`, then default to `GlobalStack`.

For `provider=GlobalStack`, runners receive deterministic Azure-shaped local identity settings and send ARM requests to the sidecar endpoint. For `provider=Azure`, the same task is routed to `https://management.azure.com` and requires real Azure authentication plus a real `ARM_SUBSCRIPTION_ID`.

## Platform Coverage

| Platform | Native toolchain check | Deploy path | Current smoke status |
|---|---|---|---|
| `azure-terraform-hcl` | `terraform fmt -check`, `terraform init -backend=false`, `terraform validate` | Native AzAPI provider `apply`, refresh plan, refresh-only plan, state list, and `destroy` through runner-selected provider endpoint | PASS |
| `azure-opentofu-hcl` | `tofu fmt -check`, `tofu init -backend=false`, `tofu validate` | Native AzAPI provider `apply`, refresh plan, refresh-only plan, state list, and `destroy` through runner-selected provider endpoint | PASS |
| `azure-pulumi-ts` | Pulumi project shape and `@pulumi/azure-native` usage check | Native Pulumi Azure Native `up`, `preview --diff`, `refresh`, stack export, and `destroy` through runner-transparent GlobalStack endpoint routing | PASS |
| `azure-pulumi-py` | Python syntax compile for Pulumi entrypoints | Native Pulumi Azure Native `up`, `preview --diff`, `refresh`, stack export, and `destroy` through runner-transparent GlobalStack endpoint routing | PASS |
| `azure-pulumi-yaml` | Pulumi YAML project shape and Azure Native resource check | Native Pulumi Azure Native `up`, `preview --diff`, `refresh`, stack export, and `destroy` through runner-transparent GlobalStack endpoint routing | PASS |
| `azure-ansible-yaml` | `ansible-playbook --syntax-check` | Native `azure.azcollection` deploy, focused `azure_rm_resource` idempotency check, explicit ARM reads, and destroy through runner-transparent GlobalStack routing | PASS |
| `azure-cli-rest` | `bash -n` plus Azure CLI REST script shape checks | Native task-owned `az rest` PUT/GET/DELETE calls with idempotency and explicit ARM reads through the runner-selected provider endpoint | PASS |
| `azure-bicep` | `az bicep build` against the Bicep task | Compiled Bicep ARM template deploy, redeploy, deployment GET, resource GET, and destroy through Azure CLI REST | PASS |
| `azure-arm-json` | `jq` validation for ARM template and parameters | ARM template deploy, redeploy, deployment GET, resource GET, and destroy through Azure CLI REST | PASS |

## Provider Selection

Each task may include:

```json
{
  "provider": "GlobalStack"
}
```

Accepted values are `GlobalStack` and `Azure`. Metadata takes precedence over environment variables so dataset tasks can pin their intended execution backend. If `metadata.json` is absent, `PROVIDER` or `CLOUD_PROVIDER` can select the backend; if neither is set, the runner defaults to `GlobalStack`.

## Current Boundary

Terraform and OpenTofu perform native AzAPI provider `apply` and `destroy` against the selected provider endpoint. In GlobalStack mode, the runner inserts a local Azure CLI token shim plus a TLS loopback proxy because the AzAPI provider expects authenticated HTTPS management endpoints.

Pulumi TypeScript, Pulumi Python, and Pulumi YAML perform native Azure Native deployment in GlobalStack mode. The task code remains normal Azure Pulumi code; the runner maps public Azure identity and management hostnames to a local TLS proxy in the shared sidecar network, installs a local CA for that proxy, and uses deterministic local service-principal values. Do not configure Pulumi with Azure Stack settings for this path.

Ansible performs native Azure module deployment with `azure.azcollection`. In GlobalStack mode, the runner keeps the playbook Azure-native, configures deterministic local service-principal environment variables, and routes public Azure identity and management hostnames to the sidecar through the local TLS proxy.

Azure CLI REST performs native task-owned `az rest` calls. The script reads `ARM_ENDPOINT`, `ARM_SUBSCRIPTION_ID`, `AZURE_LOCATION`, and `AZURE_ACCESS_TOKEN`, uses normal Azure CLI syntax, and writes output evidence to `AZURE_DEPLOYMENT_OUTPUTS_PATH` when present.

The `provider-lifecycle` stage is mandatory for full-scope runs. It records `provider-lifecycle-response.json` and the smoke harness fails the platform if that report is missing, has no operations, or contains a failed operation. HCL platforms exercise refresh/diff-style plans and state reads; Pulumi platforms exercise preview, refresh, idempotent up, and stack export; Ansible exercises an Azure module idempotency re-apply plus ARM reads; Azure CLI REST exercises idempotent script re-run plus ARM reads; Bicep and ARM JSON exercise idempotent redeploy plus deployment/resource reads.

ARM JSON is already the native ARM contract format. Its runner validates the task ARM template and deploys it directly through Azure-shaped REST.

Bicep is the current native reference because the Bicep file is compiled by Azure CLI and the compiled ARM output is deployed through the same Azure-shaped REST path.

## Image Reuse and Storage

Set `GLOBALSTACK_IMAGE_BUILD_STRATEGY=reuse` to require existing images. Missing images fail before Compose starts; the lifecycle command does not implicitly pull or build them. `GLOBALSTACK_RUNNER_IMAGE` and `GLOBALSTACK_AZURE_IMAGE` select locally available overrides.

Set `GLOBALSTACK_ARM_HOST_PORT=0` to allocate an ephemeral loopback host port when the default port is occupied. The runner continues to use port 4566 inside its shared network.

Each attempt replaces its generated report directory. Passing requires all seven stage reports to match the platform and stage, every provider operation to pass, successful deployment and destruction, and successful Compose cleanup. Preserve reports before retrying if you need the earlier attempt's evidence.

## Smoke Command

Run the full matrix:

```bash
npm run smoke:platform-runners
```

Run one or more platforms:

```bash
npm run smoke:platform-runners -- --platform=azure-terraform-hcl,azure-bicep
```

The matrix writes:

- `dist/platform-lifecycle-smoke-results.json`
- `dist/platform-images/<platform>/reports/lifecycle-report.json`
- `dist/platform-images/<platform>/reports/deployment-response.json`
- `dist/platform-images/<platform>/reports/provider-lifecycle-response.json`

## Historical Local Smoke

A previous local smoke recorded all `9/9` platforms across the combined matrix with final stage `destroy`, final status `PASS`, deployment provisioning state `Succeeded`, and provider-lifecycle evidence present for each platform.

Command:

```bash
npm run smoke:platform-runners
```
