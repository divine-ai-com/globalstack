export const azurePlatforms = [
  {
    id: 'azure-terraform-hcl',
    label: 'Terraform Azure HCL',
    toolchain: 'terraform',
    language: 'hcl',
    imageTag: 'globalstack/azure-terraform-hcl:local',
    dockerfile: 'Dockerfile.terraform',
    solutionFiles: ['lib/main.tf', 'lib/outputs.tf', 'lib/variables.tf', 'lib/provider.tf'],
    testFiles: ['test/terraform.unit.test.ts', 'test/terraform.int.test.ts'],
    implGuidance:
      'write the task-owned Azure Terraform resources in lib/main.tf and deployed identifiers in lib/outputs.tf. use var.environment_suffix for deploy isolation and rely on provider.tf plus variables.tf for shared Azure provider wiring.',
  },
  {
    id: 'azure-opentofu-hcl',
    label: 'OpenTofu Azure HCL',
    toolchain: 'opentofu',
    language: 'hcl',
    imageTag: 'globalstack/azure-opentofu-hcl:local',
    dockerfile: 'Dockerfile.opentofu',
    solutionFiles: ['lib/main.tf', 'lib/outputs.tf', 'lib/variables.tf', 'lib/provider.tf'],
    testFiles: ['test/terraform.unit.test.ts', 'test/terraform.int.test.ts'],
    implGuidance:
      'write the task-owned Azure OpenTofu resources in lib/main.tf and deployed identifiers in lib/outputs.tf. use var.environment_suffix for deploy isolation and rely on provider.tf plus variables.tf for shared Azure provider wiring.',
  },
  {
    id: 'azure-pulumi-ts',
    label: 'Pulumi Azure TypeScript',
    toolchain: 'pulumi',
    language: 'ts',
    imageTag: 'globalstack/azure-pulumi-ts:local',
    dockerfile: 'Dockerfile.node-pulumi',
    solutionFiles: ['Pulumi.yaml', 'bin/tap.ts', 'lib/tap-stack.ts'],
    testFiles: ['test/tap-stack.unit.test.ts', 'test/tap-stack.int.test.ts'],
    implGuidance:
      'put the Pulumi program entrypoint in bin/tap.ts and the reusable component in lib/tap-stack.ts. read environmentSuffix from ENVIRONMENT_SUFFIX and include it in every Azure resource name that varies by environment.',
  },
  {
    id: 'azure-pulumi-py',
    label: 'Pulumi Azure Python',
    toolchain: 'pulumi',
    language: 'py',
    imageTag: 'globalstack/azure-pulumi-py:local',
    dockerfile: 'Dockerfile.python-pulumi',
    solutionFiles: ['Pulumi.yaml', 'tap.py', 'lib/tap_stack.py'],
    testFiles: ['tests/unit/test_tap_stack.py', 'tests/integration/test_tap_stack.py'],
    implGuidance:
      'put the Pulumi program entrypoint in tap.py and the reusable component in lib/tap_stack.py. read environment_suffix from ENVIRONMENT_SUFFIX and include it in every Azure resource name that varies by environment.',
  },
  {
    id: 'azure-pulumi-yaml',
    label: 'Pulumi Azure YAML',
    toolchain: 'pulumi',
    language: 'yaml',
    imageTag: 'globalstack/azure-pulumi-yaml:local',
    dockerfile: 'Dockerfile.pulumi-yaml',
    solutionFiles: ['Pulumi.yaml'],
    testFiles: ['tests/unit/pulumi_yaml_unit.test.ts', 'tests/integration/pulumi_yaml_int.test.ts'],
    implGuidance:
      'write the entire Pulumi YAML program in Pulumi.yaml with runtime: yaml. use environmentSuffix variables or Pulumi config for deploy isolation and export deployed identifiers as top-level outputs.',
  },
  {
    id: 'azure-ansible-yaml',
    label: 'Ansible Azure YAML',
    toolchain: 'ansible',
    language: 'yaml',
    imageTag: 'globalstack/azure-ansible-yaml:local',
    dockerfile: 'Dockerfile.ansible',
    solutionFiles: ['lib/playbook.yml', 'inventory.yml', 'ansible.cfg'],
    testFiles: ['test/ansible.unit.test.ts', 'test/ansible.int.test.ts'],
    implGuidance:
      'write the Ansible automation in lib/playbook.yml and role/task YAML. run against localhost, read environment_suffix and azure_location from extra vars, and support desired_state=present and desired_state=absent for deploy and destroy.',
  },
  {
    id: 'azure-bicep',
    label: 'Azure Bicep',
    toolchain: 'bicep',
    language: 'bicep',
    imageTag: 'globalstack/azure-bicep:local',
    dockerfile: 'Dockerfile.azure-cli',
    solutionFiles: ['lib/main.bicep', 'lib/parameters.json'],
    testFiles: ['test/bicep.unit.test.ts', 'test/bicep.int.test.ts'],
    implGuidance:
      'write the deployment in lib/main.bicep with parameters in lib/parameters.json. include environmentSuffix in resource names and expose deployed identifiers as Bicep outputs.',
  },
  {
    id: 'azure-arm-json',
    label: 'Azure ARM JSON',
    toolchain: 'arm',
    language: 'json',
    imageTag: 'globalstack/azure-arm-json:local',
    dockerfile: 'Dockerfile.azure-cli',
    solutionFiles: ['lib/azuredeploy.json', 'lib/azuredeploy.parameters.json'],
    testFiles: ['test/arm.unit.test.ts', 'test/arm.int.test.ts'],
    implGuidance:
      'write the deployment as an ARM JSON template in lib/azuredeploy.json with parameters in lib/azuredeploy.parameters.json. include environmentSuffix in resource names and expose deployed identifiers as template outputs.',
  },
];

export const smokeScenarios = [
  {
    id: 'mlops-feature-intake-lake',
    title: 'MLOps feature intake lake',
    services: ['Blob Storage', 'Storage Account', 'Event Grid', 'Function Apps', 'Key Vault', 'Log Analytics'],
    globalstackCoverage: {
      enabled: ['Blob Storage', 'Storage Account', 'Event Grid', 'Function Apps', 'Key Vault', 'Log Analytics'],
      missing: ['Azure Machine Learning workspace'],
    },
    prompt:
      'build an Azure deployment for an MLOps feature intake lake. incoming feature batches land in blob storage, upload events publish through Event Grid, and a function validates metadata before writing a processing marker. signing and registry secrets must live in Key Vault, logs should be queryable in Log Analytics, and every task-owned resource must include the environment suffix in its name. model registry integration should be represented as outputs and configuration hooks for a future Azure Machine Learning workspace connection.',
  },
  {
    id: 'robotics-fleet-telemetry-buffer',
    title: 'Robotics fleet telemetry buffer',
    services: ['Service Bus', 'Service Bus Data Plane', 'Function Apps', 'Managed Identity', 'Role Assignment', 'Monitor'],
    globalstackCoverage: {
      enabled: ['Service Bus', 'Service Bus Data Plane', 'Function Apps', 'Managed Identity', 'Role Assignment', 'Monitor'],
      missing: ['IoT Hub', 'Azure Digital Twins'],
    },
    prompt:
      'create an Azure deployment for robotics fleet telemetry. Service Bus should buffer command acknowledgements and telemetry envelopes from field robots, a function should consume queue messages with a managed identity, and Monitor should expose basic failure visibility. include documented integration boundaries for future IoT Hub and Azure Digital Twins connections while deploying the queue, worker, identity, and monitoring resources required by this task.',
  },
  {
    id: 'regulated-genai-knowledge-ingestion',
    title: 'Regulated GenAI knowledge ingestion',
    services: ['Blob Storage', 'Storage Account', 'Queue Storage', 'Key Vault', 'API Management', 'Application Insights'],
    globalstackCoverage: {
      enabled: ['Blob Storage', 'Storage Account', 'Queue Storage', 'Key Vault', 'API Management', 'Application Insights'],
      missing: ['Azure AI Search', 'Azure OpenAI'],
    },
    prompt:
      'design an Azure deployment for regulated GenAI knowledge ingestion. source documents should land in private blob containers, queue messages should drive chunking work, API Management should expose a narrow ingestion API, and Key Vault should hold signing and downstream model credentials. Azure AI Search and Azure OpenAI should be treated as future external integrations. outputs must include storage, queue, API, vault, and observability identifiers.',
  },
  {
    id: 'edge-vision-model-release',
    title: 'Edge vision model release pipeline',
    services: ['Container Registry', 'Container Apps', 'Blob Storage', 'Key Vault', 'Managed Identity', 'Role Assignment'],
    globalstackCoverage: {
      enabled: ['Container Registry', 'Container Apps', 'Blob Storage', 'Key Vault', 'Managed Identity', 'Role Assignment'],
      missing: ['Azure Machine Learning managed endpoint'],
    },
    prompt:
      'build an Azure deployment for releasing computer-vision models to edge devices. model artifacts should be stored in blob storage, runtime images should be published to Container Registry, a Container App should expose a validation endpoint, and Key Vault plus managed identity should protect pull and signing secrets. Azure Machine Learning managed endpoints should be represented as future integration outputs.',
  },
  {
    id: 'digital-twin-factory-events',
    title: 'Digital twin factory event mesh',
    services: ['Event Grid', 'Service Bus', 'Function Apps', 'Table Storage', 'Application Insights', 'Key Vault'],
    globalstackCoverage: {
      enabled: ['Event Grid', 'Service Bus', 'Function Apps', 'Table Storage', 'Application Insights', 'Key Vault'],
      missing: ['Azure Digital Twins'],
    },
    prompt:
      'create an Azure deployment for smart-factory event routing. Event Grid should receive cell status events, Service Bus should buffer remediation work, Functions should update a simple table-backed state projection, and Key Vault should hold webhook signing secrets. Azure Digital Twins should be modeled as a future integration boundary.',
  },
  {
    id: 'autonomous-simulation-batch',
    title: 'Autonomous simulation batch runs',
    services: ['Blob Storage', 'Queue Storage', 'Container Apps', 'Container Instances', 'Log Analytics', 'Managed Identity'],
    globalstackCoverage: {
      enabled: ['Blob Storage', 'Queue Storage', 'Container Apps', 'Container Instances', 'Log Analytics', 'Managed Identity'],
      missing: ['Azure Batch'],
    },
    prompt:
      'build an Azure deployment for autonomous-system simulation batches. scenarios and result artifacts should live in blob storage, queue storage should schedule simulation runs, and container workloads should read jobs with managed identity and emit logs into Log Analytics. Azure Batch should be represented as a future production option.',
  },
  {
    id: 'clinical-imaging-deid-pipeline',
    title: 'Clinical imaging de-identification pipeline',
    services: ['Blob Storage', 'Queue Storage', 'Function Apps', 'Key Vault', 'Private Endpoint', 'Private DNS Zone', 'Log Analytics'],
    globalstackCoverage: {
      enabled: ['Blob Storage', 'Queue Storage', 'Function Apps', 'Key Vault', 'Private Endpoint', 'Private DNS Zone', 'Log Analytics'],
      missing: ['Azure Health Data Services'],
    },
    prompt:
      'create an Azure deployment for a clinical imaging de-identification workflow. protected image files should be uploaded to a private blob container, queue messages should trigger a function worker, Key Vault should hold de-identification salts, and private networking plus private DNS should be included for storage access. Azure Health Data Services should be documented as a future integration boundary.',
  },
  {
    id: 'networked-postgres-api',
    title: 'Networked PostgreSQL API foundation',
    services: ['API Management', 'DB for PostgreSQL', 'Virtual Network', 'Private Endpoint', 'Private DNS Zone', 'Key Vault'],
    globalstackCoverage: {
      enabled: ['API Management', 'DB for PostgreSQL', 'Virtual Network', 'Private Endpoint', 'Private DNS Zone', 'Key Vault'],
      missing: [],
    },
    prompt:
      'create an Azure deployment for an internal customer API backed by PostgreSQL. API Management should front the API, PostgreSQL should be reachable through private network resources, and database credentials should come from Key Vault. keep the network simple with one virtual network, one private endpoint, and private DNS. outputs should identify the API endpoint, database server, private endpoint, DNS zone, and Key Vault.',
  },
  {
    id: 'fraud-stream-control-plane',
    title: 'Fraud stream control plane',
    services: ['Event Grid', 'Service Bus', 'Blob Storage', 'Key Vault', 'Application Insights', 'Role Assignment'],
    globalstackCoverage: {
      enabled: ['Event Grid', 'Service Bus', 'Blob Storage', 'Key Vault', 'Application Insights', 'Role Assignment'],
      missing: ['Azure Stream Analytics'],
    },
    prompt:
      'build an Azure deployment for a fraud-stream control plane. transaction events should arrive through Event Grid, Service Bus should buffer enrichment tasks, blob storage should retain raw payloads for replay, and Key Vault should protect partner API credentials. Azure Stream Analytics should be represented as a production integration boundary.',
  },
  {
    id: 'tier2-resilience-edge-foundation',
    title: 'Tier 2 resilience edge foundation',
    services: ['DB for MySQL', 'Azure Cache for Redis', 'Azure DNS', 'Event Hubs', 'App Configuration', 'WAF Policy'],
    globalstackCoverage: {
      enabled: ['DB for MySQL metadata', 'Redis metadata', 'DNS metadata', 'Event Hubs metadata', 'App Configuration metadata', 'WAF Policy metadata'],
      missing: ['full WAF rule engine', 'global CDN edge behavior', 'managed database lifecycle parity'],
    },
    prompt:
      'create an Azure deployment for a Tier 2 resilience foundation. MySQL should hold workflow state, Redis should cache hot configuration, Event Hubs should receive telemetry streams, App Configuration should hold runtime flags, Azure DNS should model internal discovery, and WAF policy configuration should protect the front door integration. Keep CDN edge behavior, full WAF enforcement, and managed database lifecycle as explicit future integration boundaries.',
  },
  {
    id: 'wave1-storage-messaging-foundation',
    title: 'Wave 1 storage and messaging foundation',
    services: ['Blob Storage', 'Queue Storage', 'Azure Files', 'Table Storage', 'Service Bus Topics', 'Event Grid', 'Event Hubs', 'App Configuration'],
    globalstackCoverage: {
      enabled: ['Blob Storage', 'Queue Storage', 'Azure Files metadata', 'Table Storage metadata', 'Service Bus Topics', 'Event Grid', 'Event Hubs metadata', 'App Configuration metadata'],
      missing: ['Cosmos DB full data plane', 'Event Grid delivery engine parity', 'Event Hubs broker data-plane parity'],
    },
    prompt:
      'create an Azure deployment for a storage and messaging foundation used by model-artifact intake workflows. It should create one storage account with blob, queue, file share, and table resources, one Service Bus namespace with a topic, one Event Grid topic, one Event Hubs namespace with an event hub, and one App Configuration store. Keep Cosmos DB, Event Grid delivery rules, and Event Hubs consumer processing as explicit future integration boundaries.',
  },
];
