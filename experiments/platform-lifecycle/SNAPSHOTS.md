# Native platform lifecycle snapshots

Nine native Azure platform implementations of one empty-resource-group lifecycle. These are local captures. The new live pairs and Azure Portal screenshots remain pending browser access. The earlier Terraform pair is retained separately and does not satisfy the new portal screenshot requirement.

[Tool-specific lifecycle plan](PLAN.md) · [Downloadable offline comparison](SNAPSHOTS.html) · [Earlier Terraform paired snapshots](../paired-lifecycle/SNAPSHOTS.md)

## Coverage

| Platform | Local command stages | Native ARM exchanges | Azure |
| --- | ---: | ---: | --- |
| [Terraform Azure HCL](#azure-terraform-hcl) | 16 | 20 | Pending live run and Azure Portal capture |
| [OpenTofu Azure HCL](#azure-opentofu-hcl) | 16 | 20 | Pending live run and Azure Portal capture |
| [Pulumi Azure TypeScript](#azure-pulumi-ts) | 24 | 14 | Pending live run and Azure Portal capture |
| [Pulumi Azure Python](#azure-pulumi-py) | 24 | 14 | Pending live run and Azure Portal capture |
| [Pulumi Azure YAML](#azure-pulumi-yaml) | 23 | 14 | Pending live run and Azure Portal capture |
| [Ansible Azure YAML](#azure-ansible-yaml) | 12 | 23 | Pending live run and Azure Portal capture |
| [Azure CLI REST Bash](#azure-cli-rest) | 10 | 8 | Pending live run and Azure Portal capture |
| [Azure Bicep](#azure-bicep) | 15 | 12 | Pending live run and Azure Portal capture |
| [Azure ARM JSON](#azure-arm-json) | 14 | 12 | Pending live run and Azure Portal capture |

The final local matrix contains 154 command stages and 137 native ARM exchanges across nine platform implementations. These are nine implementations of one scenario, not nine independent architectures.

## Reading the snapshots

- Each record preserves actual command arguments, exit status, UTC start/end times, bounded sanitized output, and selected ARM request/response fields. Direct probes and cleanup evidence remain separate from native commands.
- Source hashes and image IDs identify each run. The fixtures contain no branch for the target environment. External credentials and routing select the target; identity acquisition is not being compared.
- No Azure Portal screenshot is included in this local-only record. Screenshots of a generated report are not substitutes for portal evidence. Live cells remain pending until real captures exist.
- Command timing includes container and provider overhead. These single runs are not a speed benchmark. No data-plane, application-event or broad service-compatibility conclusion follows from an empty resource group.
- A native command can produce several API calls. State/import applies only to the HCL and Pulumi families. Bicep/ARM compilation and az rest template submission are distinct from az deployment command coverage.

<a id="azure-terraform-hcl"></a>

## Terraform Azure HCL

Lifecycle recorded: version → format → init → validate → plan-create → apply-create → plan-stable → refresh → plan-update → apply-update → plan-drift → apply-repair → state-remove → import → plan-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-terraform-hcl.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| format | Exit 0; no ARM exchange captured | Pending |
| init | Exit 0; no ARM exchange captured | Pending |
| validate | Exit 0; no ARM exchange captured | Pending |
| plan-create | Exit 2; no ARM exchange captured | Pending |
| apply-create | Exit 0; GET 404 → PUT 201 → GET 200 | Pending |
| plan-stable | Exit 0; GET 200 | Pending |
| refresh | Exit 0; GET 200 | Pending |
| plan-update | Exit 2; GET 200 | Pending |
| apply-update | Exit 0; GET 200 → PUT 200 → GET 200 | Pending |
| plan-drift | Exit 2; GET 200 | Pending |
| apply-repair | Exit 0; GET 200 → PUT 200 → GET 200 | Pending |
| state-remove | Exit 0; no ARM exchange captured | Pending |
| import | Exit 0; GET 200 → GET 200 | Pending |
| plan-imported | Exit 0; GET 200 → GET 200 | Pending |
| destroy | Exit 0; GET 200 → GET 200 → DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-opentofu-hcl"></a>

## OpenTofu Azure HCL

Lifecycle recorded: version → format → init → validate → plan-create → apply-create → plan-stable → refresh → plan-update → apply-update → plan-drift → apply-repair → state-remove → import → plan-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-opentofu-hcl.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| format | Exit 0; no ARM exchange captured | Pending |
| init | Exit 0; no ARM exchange captured | Pending |
| validate | Exit 0; no ARM exchange captured | Pending |
| plan-create | Exit 2; no ARM exchange captured | Pending |
| apply-create | Exit 0; GET 404 → PUT 201 → GET 200 | Pending |
| plan-stable | Exit 0; GET 200 | Pending |
| refresh | Exit 0; GET 200 | Pending |
| plan-update | Exit 2; GET 200 | Pending |
| apply-update | Exit 0; GET 200 → PUT 200 → GET 200 | Pending |
| plan-drift | Exit 2; GET 200 | Pending |
| apply-repair | Exit 0; GET 200 → PUT 200 → GET 200 | Pending |
| state-remove | Exit 0; no ARM exchange captured | Pending |
| import | Exit 0; GET 200 → GET 200 | Pending |
| plan-imported | Exit 0; GET 200 → GET 200 | Pending |
| destroy | Exit 0; GET 200 → GET 200 → DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-pulumi-ts"></a>

## Pulumi Azure TypeScript

Lifecycle recorded: version → dependencies → provider-install → stack-init → config-azure-native:subscriptionId → config-groupName → config-location → config-runId → config-expires → config-revision → preview-create → up-create → preview-stable → refresh → config-revision → preview-update → up-update → refresh-drift → up-repair → state-export → state-remove → import → preview-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-pulumi-ts.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| dependencies | Exit 0; no ARM exchange captured | Pending |
| provider-install | Exit 0; no ARM exchange captured | Pending |
| stack-init | Exit 0; no ARM exchange captured | Pending |
| config-azure-native:subscriptionId | Exit 0; no ARM exchange captured | Pending |
| config-groupName | Exit 0; no ARM exchange captured | Pending |
| config-location | Exit 0; no ARM exchange captured | Pending |
| config-runId | Exit 0; no ARM exchange captured | Pending |
| config-expires | Exit 0; no ARM exchange captured | Pending |
| config-revision | Exit 0; no ARM exchange captured | Pending |
| preview-create | Exit 0; no ARM exchange captured | Pending |
| up-create | Exit 0; GET 404 → PUT 201 → GET 200 | Pending |
| preview-stable | Exit 0; no ARM exchange captured | Pending |
| refresh | Exit 0; GET 200 → GET 200 | Pending |
| config-revision | Exit 0; no ARM exchange captured | Pending |
| preview-update | Exit 0; no ARM exchange captured | Pending |
| up-update | Exit 0; PUT 200 → GET 200 | Pending |
| refresh-drift | Exit 0; GET 200 → GET 200 | Pending |
| up-repair | Exit 0; PUT 200 → GET 200 | Pending |
| state-export | Exit 0; no ARM exchange captured | Pending |
| state-remove | Exit 0; no ARM exchange captured | Pending |
| import | Exit 0; GET 200 → GET 200 | Pending |
| preview-imported | Exit 0; no ARM exchange captured | Pending |
| destroy | Exit 0; DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-pulumi-py"></a>

## Pulumi Azure Python

Lifecycle recorded: version → dependencies → provider-install → stack-init → config-azure-native:subscriptionId → config-groupName → config-location → config-runId → config-expires → config-revision → preview-create → up-create → preview-stable → refresh → config-revision → preview-update → up-update → refresh-drift → up-repair → state-export → state-remove → import → preview-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-pulumi-py.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| dependencies | Exit 0; no ARM exchange captured | Pending |
| provider-install | Exit 0; no ARM exchange captured | Pending |
| stack-init | Exit 0; no ARM exchange captured | Pending |
| config-azure-native:subscriptionId | Exit 0; no ARM exchange captured | Pending |
| config-groupName | Exit 0; no ARM exchange captured | Pending |
| config-location | Exit 0; no ARM exchange captured | Pending |
| config-runId | Exit 0; no ARM exchange captured | Pending |
| config-expires | Exit 0; no ARM exchange captured | Pending |
| config-revision | Exit 0; no ARM exchange captured | Pending |
| preview-create | Exit 0; no ARM exchange captured | Pending |
| up-create | Exit 0; GET 404 → PUT 201 → GET 200 | Pending |
| preview-stable | Exit 0; no ARM exchange captured | Pending |
| refresh | Exit 0; GET 200 → GET 200 | Pending |
| config-revision | Exit 0; no ARM exchange captured | Pending |
| preview-update | Exit 0; no ARM exchange captured | Pending |
| up-update | Exit 0; PUT 200 → GET 200 | Pending |
| refresh-drift | Exit 0; GET 200 → GET 200 | Pending |
| up-repair | Exit 0; PUT 200 → GET 200 | Pending |
| state-export | Exit 0; no ARM exchange captured | Pending |
| state-remove | Exit 0; no ARM exchange captured | Pending |
| import | Exit 0; GET 200 → GET 200 | Pending |
| preview-imported | Exit 0; no ARM exchange captured | Pending |
| destroy | Exit 0; DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-pulumi-yaml"></a>

## Pulumi Azure YAML

Lifecycle recorded: version → provider-install → stack-init → config-azure-native:subscriptionId → config-groupName → config-location → config-runId → config-expires → config-revision → preview-create → up-create → preview-stable → refresh → config-revision → preview-update → up-update → refresh-drift → up-repair → state-export → state-remove → import → preview-imported → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-pulumi-yaml.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| provider-install | Exit 0; no ARM exchange captured | Pending |
| stack-init | Exit 0; no ARM exchange captured | Pending |
| config-azure-native:subscriptionId | Exit 0; no ARM exchange captured | Pending |
| config-groupName | Exit 0; no ARM exchange captured | Pending |
| config-location | Exit 0; no ARM exchange captured | Pending |
| config-runId | Exit 0; no ARM exchange captured | Pending |
| config-expires | Exit 0; no ARM exchange captured | Pending |
| config-revision | Exit 0; no ARM exchange captured | Pending |
| preview-create | Exit 0; no ARM exchange captured | Pending |
| up-create | Exit 0; GET 404 → PUT 201 → GET 200 | Pending |
| preview-stable | Exit 0; no ARM exchange captured | Pending |
| refresh | Exit 0; GET 200 → GET 200 | Pending |
| config-revision | Exit 0; no ARM exchange captured | Pending |
| preview-update | Exit 0; no ARM exchange captured | Pending |
| up-update | Exit 0; PUT 200 → GET 200 | Pending |
| refresh-drift | Exit 0; GET 200 → GET 200 | Pending |
| up-repair | Exit 0; PUT 200 → GET 200 | Pending |
| state-export | Exit 0; no ARM exchange captured | Pending |
| state-remove | Exit 0; no ARM exchange captured | Pending |
| import | Exit 0; GET 200 → GET 200 | Pending |
| preview-imported | Exit 0; no ARM exchange captured | Pending |
| destroy | Exit 0; DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-ansible-yaml"></a>

## Ansible Azure YAML

Lifecycle recorded: version → syntax-check → check-create → apply-create → repeat-stable → check-stable → check-update → apply-update → check-drift → apply-repair → repeat-final → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-ansible-yaml.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| syntax-check | Exit 0; no ARM exchange captured | Pending |
| check-create | Exit 0; GET 404 | Pending |
| apply-create | Exit 0; GET 404 → HEAD 404 → PUT 201 | Pending |
| repeat-stable | Exit 0; GET 200 → GET 200 | Pending |
| check-stable | Exit 0; GET 200 → GET 200 | Pending |
| check-update | Exit 0; GET 200 → GET 200 | Pending |
| apply-update | Exit 0; GET 200 → GET 200 → PUT 200 | Pending |
| check-drift | Exit 0; GET 200 → GET 200 | Pending |
| apply-repair | Exit 0; GET 200 → GET 200 → PUT 200 | Pending |
| repeat-final | Exit 0; GET 200 → GET 200 | Pending |
| destroy | Exit 0; GET 200 → GET 200 → DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-cli-rest"></a>

## Azure CLI REST Bash

Lifecycle recorded: version → syntax-check → apply-create → repeat-stable → read → apply-update → read-drift → apply-repair → repeat-final → destroy.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-cli-rest.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| syntax-check | Exit 0; no ARM exchange captured | Pending |
| apply-create | Exit 0; PUT 201 | Pending |
| repeat-stable | Exit 0; PUT 200 | Pending |
| read | Exit 0; GET 200 | Pending |
| apply-update | Exit 0; PUT 200 | Pending |
| read-drift | Exit 0; GET 200 | Pending |
| apply-repair | Exit 0; PUT 200 | Pending |
| repeat-final | Exit 0; PUT 200 | Pending |
| destroy | Exit 0; DELETE 200 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-bicep"></a>

## Azure Bicep

Lifecycle recorded: version → compile → cli-version → deploy-create → deploy-create-read-0 → read-stable → read-group → deploy-update → deploy-update-read-0 → read-drift → deploy-repair → deploy-repair-read-0 → read-final → destroy-group → destroy-deployment.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-bicep.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| version | Exit 0; no ARM exchange captured | Pending |
| compile | Exit 0; no ARM exchange captured | Pending |
| cli-version | Exit 0; no ARM exchange captured | Pending |
| deploy-create | Exit 0; PUT 201 | Pending |
| deploy-create-read-0 | Exit 0; GET 200 | Pending |
| read-stable | Exit 0; GET 200 | Pending |
| read-group | Exit 0; GET 200 | Pending |
| deploy-update | Exit 0; PUT 201 | Pending |
| deploy-update-read-0 | Exit 0; GET 200 | Pending |
| read-drift | Exit 0; GET 200 | Pending |
| deploy-repair | Exit 0; PUT 201 | Pending |
| deploy-repair-read-0 | Exit 0; GET 200 | Pending |
| read-final | Exit 0; GET 200 | Pending |
| destroy-group | Exit 0; DELETE 200 | Pending |
| destroy-deployment | Exit 0; DELETE 202 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.

<a id="azure-arm-json"></a>

## Azure ARM JSON

Lifecycle recorded: validate-json → cli-version → deploy-create → deploy-create-read-0 → read-stable → read-group → deploy-update → deploy-update-read-0 → read-drift → deploy-repair → deploy-repair-read-0 → read-final → destroy-group → destroy-deployment.

Source revision: `7192faabe735d8c4f4b99bc0cb4c52c27a69f748`. [Retained JSON](evidence/local/azure-arm-json.json). All reported stages completed and cleanup confirmed absence.

| Stage | GlobalStack command outcome | Azure |
| --- | --- | --- |
| validate-json | Exit 0; no ARM exchange captured | Pending |
| cli-version | Exit 0; no ARM exchange captured | Pending |
| deploy-create | Exit 0; PUT 201 | Pending |
| deploy-create-read-0 | Exit 0; GET 200 | Pending |
| read-stable | Exit 0; GET 200 | Pending |
| read-group | Exit 0; GET 200 | Pending |
| deploy-update | Exit 0; PUT 201 | Pending |
| deploy-update-read-0 | Exit 0; GET 200 | Pending |
| read-drift | Exit 0; GET 200 | Pending |
| deploy-repair | Exit 0; PUT 201 | Pending |
| deploy-repair-read-0 | Exit 0; GET 200 | Pending |
| read-final | Exit 0; GET 200 | Pending |
| destroy-group | Exit 0; DELETE 200 | Pending |
| destroy-deployment | Exit 0; DELETE 202 | Pending |

The HTML expands command output, request/response snapshots, independent probes and cleanup.
