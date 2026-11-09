# Native platform lifecycle snapshots

Nine native Azure platform implementations of one empty-resource-group lifecycle. This page contains local captures only. All nine native Azure pairs are recorded separately in LIVE.md. Azure Portal screenshots remain pending. The earlier Terraform pair is retained separately and does not satisfy the Portal screenshot requirement.

[Tool-specific lifecycle plan](PLAN.md) · [Recorded live pairs](LIVE.md) · [Downloadable offline comparison](SNAPSHOTS.html) · [Earlier Terraform paired snapshots](../paired-lifecycle/SNAPSHOTS.md)

## Coverage

| Platform | Local command stages | Native ARM exchanges | Azure |
| --- | ---: | ---: | --- |
| [Terraform Azure HCL](#azure-terraform-hcl) | 16 | 20 | See separate live pair; Portal capture pending |
| [OpenTofu Azure HCL](#azure-opentofu-hcl) | 16 | 20 | See separate live pair; Portal capture pending |
| [Pulumi Azure TypeScript](#azure-pulumi-ts) | 24 | 14 | See separate live pair; Portal capture pending |
| [Pulumi Azure Python](#azure-pulumi-py) | 24 | 14 | See separate live pair; Portal capture pending |
| [Pulumi Azure YAML](#azure-pulumi-yaml) | 23 | 14 | See separate live pair; Portal capture pending |
| [Ansible Azure YAML](#azure-ansible-yaml) | 12 | 23 | See separate live pair; Portal capture pending |
| [Azure CLI REST Bash](#azure-cli-rest) | 10 | 8 | See separate live pair; Portal capture pending |
| [Azure Bicep](#azure-bicep) | 15 | 12 | See separate live pair; Portal capture pending |
| [Azure ARM JSON](#azure-arm-json) | 14 | 12 | See separate live pair; Portal capture pending |

The final local matrix contains 154 command stages and 137 native ARM exchanges across nine platform implementations. These are nine implementations of one scenario, not nine independent architectures.

## Reading the snapshots

- Each record preserves actual command arguments, exit status, UTC start/end times, bounded sanitized output, and selected ARM request/response fields. Direct probes and cleanup evidence remain separate from native commands.
- Source hashes and image IDs identify each run. The fixtures contain no branch for the target environment. External credentials and routing select the target; identity acquisition is not being compared.
- No Azure Portal screenshot is included in this local-only record. Screenshots of a generated report are not substitutes for Portal evidence. Per-stage Azure cells on this page are not populated from the separate live-run ledger.
- Command timing includes container and provider overhead. These single runs are not a speed benchmark. No data-plane, application-event or broad service-compatibility conclusion follows from an empty resource group.
- A native command can produce several API calls. State/import applies only to the HCL and Pulumi families. Bicep/ARM compilation and az rest template submission are distinct from az deployment command coverage.

<a id="azure-terraform-hcl"></a>

## Terraform Azure HCL

Lifecycle recorded: version → format → init → validate → plan-create → apply-create → plan-stable → refresh → plan-update → apply-update → plan-drift → apply-repair → state-remove → import → plan-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-terraform-hcl.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| format | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| init | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| validate | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| plan-create | Exit 2; no ARM exchange captured | See [live pair](LIVE.md) |
| apply-create | Exit 0; GET 404 → PUT 201 → GET 200 | See [live pair](LIVE.md) |
| plan-stable | Exit 0; GET 200 | See [live pair](LIVE.md) |
| refresh | Exit 0; GET 200 | See [live pair](LIVE.md) |
| plan-update | Exit 2; GET 200 | See [live pair](LIVE.md) |
| apply-update | Exit 0; GET 200 → PUT 200 → GET 200 | See [live pair](LIVE.md) |
| plan-drift | Exit 2; GET 200 | See [live pair](LIVE.md) |
| apply-repair | Exit 0; GET 200 → PUT 200 → GET 200 | See [live pair](LIVE.md) |
| state-remove | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| import | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| plan-imported | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| destroy | Exit 0; GET 200 → GET 200 → DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-opentofu-hcl"></a>

## OpenTofu Azure HCL

Lifecycle recorded: version → format → init → validate → plan-create → apply-create → plan-stable → refresh → plan-update → apply-update → plan-drift → apply-repair → state-remove → import → plan-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-opentofu-hcl.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| format | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| init | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| validate | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| plan-create | Exit 2; no ARM exchange captured | See [live pair](LIVE.md) |
| apply-create | Exit 0; GET 404 → PUT 201 → GET 200 | See [live pair](LIVE.md) |
| plan-stable | Exit 0; GET 200 | See [live pair](LIVE.md) |
| refresh | Exit 0; GET 200 | See [live pair](LIVE.md) |
| plan-update | Exit 2; GET 200 | See [live pair](LIVE.md) |
| apply-update | Exit 0; GET 200 → PUT 200 → GET 200 | See [live pair](LIVE.md) |
| plan-drift | Exit 2; GET 200 | See [live pair](LIVE.md) |
| apply-repair | Exit 0; GET 200 → PUT 200 → GET 200 | See [live pair](LIVE.md) |
| state-remove | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| import | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| plan-imported | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| destroy | Exit 0; GET 200 → GET 200 → DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-pulumi-ts"></a>

## Pulumi Azure TypeScript

Lifecycle recorded: version → dependencies → provider-install → stack-init → config-azure-native:subscriptionId → config-groupName → config-location → config-runId → config-expires → config-revision → preview-create → up-create → preview-stable → refresh → config-revision → preview-update → up-update → refresh-drift → up-repair → state-export → state-remove → import → preview-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-pulumi-ts.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| dependencies | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| provider-install | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| stack-init | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-azure-native:subscriptionId | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-groupName | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-location | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-runId | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-expires | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-revision | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| preview-create | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| up-create | Exit 0; GET 404 → PUT 201 → GET 200 | See [live pair](LIVE.md) |
| preview-stable | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| refresh | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| config-revision | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| preview-update | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| up-update | Exit 0; PUT 200 → GET 200 | See [live pair](LIVE.md) |
| refresh-drift | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| up-repair | Exit 0; PUT 200 → GET 200 | See [live pair](LIVE.md) |
| state-export | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| state-remove | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| import | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| preview-imported | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| destroy | Exit 0; DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-pulumi-py"></a>

## Pulumi Azure Python

Lifecycle recorded: version → dependencies → provider-install → stack-init → config-azure-native:subscriptionId → config-groupName → config-location → config-runId → config-expires → config-revision → preview-create → up-create → preview-stable → refresh → config-revision → preview-update → up-update → refresh-drift → up-repair → state-export → state-remove → import → preview-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-pulumi-py.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| dependencies | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| provider-install | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| stack-init | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-azure-native:subscriptionId | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-groupName | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-location | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-runId | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-expires | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-revision | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| preview-create | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| up-create | Exit 0; GET 404 → PUT 201 → GET 200 | See [live pair](LIVE.md) |
| preview-stable | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| refresh | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| config-revision | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| preview-update | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| up-update | Exit 0; PUT 200 → GET 200 | See [live pair](LIVE.md) |
| refresh-drift | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| up-repair | Exit 0; PUT 200 → GET 200 | See [live pair](LIVE.md) |
| state-export | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| state-remove | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| import | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| preview-imported | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| destroy | Exit 0; DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-pulumi-yaml"></a>

## Pulumi Azure YAML

Lifecycle recorded: version → provider-install → stack-init → config-azure-native:subscriptionId → config-groupName → config-location → config-runId → config-expires → config-revision → preview-create → up-create → preview-stable → refresh → config-revision → preview-update → up-update → refresh-drift → up-repair → state-export → state-remove → import → preview-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-pulumi-yaml.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| provider-install | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| stack-init | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-azure-native:subscriptionId | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-groupName | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-location | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-runId | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-expires | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| config-revision | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| preview-create | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| up-create | Exit 0; GET 404 → PUT 201 → GET 200 | See [live pair](LIVE.md) |
| preview-stable | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| refresh | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| config-revision | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| preview-update | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| up-update | Exit 0; PUT 200 → GET 200 | See [live pair](LIVE.md) |
| refresh-drift | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| up-repair | Exit 0; PUT 200 → GET 200 | See [live pair](LIVE.md) |
| state-export | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| state-remove | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| import | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| preview-imported | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| destroy | Exit 0; DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-ansible-yaml"></a>

## Ansible Azure YAML

Lifecycle recorded: version → syntax-check → check-create → apply-create → repeat-stable → check-stable → check-update → apply-update → check-drift → apply-repair → repeat-final → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-ansible-yaml.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| syntax-check | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| check-create | Exit 0; GET 404 | See [live pair](LIVE.md) |
| apply-create | Exit 0; GET 404 → HEAD 404 → PUT 201 | See [live pair](LIVE.md) |
| repeat-stable | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| check-stable | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| check-update | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| apply-update | Exit 0; GET 200 → GET 200 → PUT 200 | See [live pair](LIVE.md) |
| check-drift | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| apply-repair | Exit 0; GET 200 → GET 200 → PUT 200 | See [live pair](LIVE.md) |
| repeat-final | Exit 0; GET 200 → GET 200 | See [live pair](LIVE.md) |
| destroy | Exit 0; GET 200 → GET 200 → DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-cli-rest"></a>

## Azure CLI REST Bash

Lifecycle recorded: version → syntax-check → apply-create → repeat-stable → read → apply-update → read-drift → apply-repair → repeat-final → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-cli-rest.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| syntax-check | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| apply-create | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| repeat-stable | Exit 0; PUT 200 | See [live pair](LIVE.md) |
| read | Exit 0; GET 200 | See [live pair](LIVE.md) |
| apply-update | Exit 0; PUT 200 | See [live pair](LIVE.md) |
| read-drift | Exit 0; GET 200 | See [live pair](LIVE.md) |
| apply-repair | Exit 0; PUT 200 | See [live pair](LIVE.md) |
| repeat-final | Exit 0; PUT 200 | See [live pair](LIVE.md) |
| destroy | Exit 0; DELETE 200 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-bicep"></a>

## Azure Bicep

Lifecycle recorded: version → compile → cli-version → deploy-create → deploy-create-read-0 → read-stable → read-group → deploy-update → deploy-update-read-0 → read-drift → deploy-repair → deploy-repair-read-0 → read-final → destroy-group → destroy-deployment.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-bicep.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| compile | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| cli-version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| deploy-create | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| deploy-create-read-0 | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-stable | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-group | Exit 0; GET 200 | See [live pair](LIVE.md) |
| deploy-update | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| deploy-update-read-0 | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-drift | Exit 0; GET 200 | See [live pair](LIVE.md) |
| deploy-repair | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| deploy-repair-read-0 | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-final | Exit 0; GET 200 | See [live pair](LIVE.md) |
| destroy-group | Exit 0; DELETE 200 | See [live pair](LIVE.md) |
| destroy-deployment | Exit 0; DELETE 202 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-arm-json"></a>

## Azure ARM JSON

Lifecycle recorded: validate-json → cli-version → deploy-create → deploy-create-read-0 → read-stable → read-group → deploy-update → deploy-update-read-0 → read-drift → deploy-repair → deploy-repair-read-0 → read-final → destroy-group → destroy-deployment.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-arm-json.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| validate-json | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| cli-version | Exit 0; no ARM exchange captured | See [live pair](LIVE.md) |
| deploy-create | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| deploy-create-read-0 | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-stable | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-group | Exit 0; GET 200 | See [live pair](LIVE.md) |
| deploy-update | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| deploy-update-read-0 | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-drift | Exit 0; GET 200 | See [live pair](LIVE.md) |
| deploy-repair | Exit 0; PUT 201 | See [live pair](LIVE.md) |
| deploy-repair-read-0 | Exit 0; GET 200 | See [live pair](LIVE.md) |
| read-final | Exit 0; GET 200 | See [live pair](LIVE.md) |
| destroy-group | Exit 0; DELETE 200 | See [live pair](LIVE.md) |
| destroy-deployment | Exit 0; DELETE 202 | See [live pair](LIVE.md) |

The HTML expands command output, request/response snapshots, independent probes and cleanup.
