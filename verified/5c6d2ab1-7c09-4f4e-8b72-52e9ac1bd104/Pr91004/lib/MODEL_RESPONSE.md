```yaml path=Pulumi.yaml
name: az-rbflow-pulumi-azurefl0521
runtime: nodejs
main: bin/tap.ts
description: Robotics diagnostics intake flow on Azure using Pulumi TypeScript

```

```json path=package.json
{
  "name": "azure-pulumi-robotics-diagnostics-intake-flow",
  "version": "1.0.0",
  "private": true,
  "main": "bin/tap.ts",
  "dependencies": {
    "@pulumi/azure-native": "^2.80.0",
    "@pulumi/pulumi": "^3.122.0",
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.0.0"
  }
}

```

```ts path=bin/tap.ts
import * as pulumi from "@pulumi/pulumi";
import { createTapStack } from "../lib/tap-stack";

const stack = createTapStack();

export const DiagnosticsStorageAccountName = stack.DiagnosticsStorageAccountName;
export const DiagnosticsArtifactsContainerName = stack.DiagnosticsArtifactsContainerName;
export const DiagnosticsJobsQueueName = stack.DiagnosticsJobsQueueName;
export const DiagnosticsLedgerTableName = stack.DiagnosticsLedgerTableName;
export const FleetEventsTopicName = stack.FleetEventsTopicName;
export const FleetConfigStoreName = stack.FleetConfigStoreName;

```

```ts path=lib/tap-stack.ts
import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as eventgrid from "@pulumi/azure-native/eventgrid";
import * as appconfiguration from "@pulumi/azure-native/appconfiguration";

export interface TapStackOutputs {
  DiagnosticsStorageAccountName: pulumi.Output<string>;
  DiagnosticsArtifactsContainerName: pulumi.Output<string>;
  DiagnosticsJobsQueueName: pulumi.Output<string>;
  DiagnosticsLedgerTableName: pulumi.Output<string>;
  FleetEventsTopicName: pulumi.Output<string>;
  FleetConfigStoreName: pulumi.Output<string>;
}

export function createTapStack(): TapStackOutputs {
  const location = "eastus";
  const deploymentSuffix = "azurefl0521";
  const tags = {
    Environment: deploymentSuffix,
    Project: "robotics-diagnostics-intake",
    Workload: "robotics",
  };

  const resourceGroup = new resources.ResourceGroup("rg-az-rbflow-pulumi-azurefl0521", {
    resourceGroupName: "rg-az-rbflow-pulumi-azurefl0521",
    location,
    tags,
  });

  const storageAccount = new storage.StorageAccount("azrbflowazurefl0521-azurefl0521", {
    accountName: "azrbflowazurefl0521",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kind: "StorageV2",
    sku: {
      name: "Standard_LRS",
    },
    allowBlobPublicAccess: false,
    minimumTlsVersion: "TLS1_2",
    enableHttpsTrafficOnly: true,
    tags,
  });

  const diagnosticsContainer = new storage.BlobContainer("diagnostics-batches-azurefl0521", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    containerName: "diagnostics-batches",
    publicAccess: "None",
  });

  const diagnosticsJobsQueue = new storage.Queue("diagnostics-jobs-azurefl0521", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    queueName: "diagnostics-jobs",
  });

  const diagnosticsLedgerTable = new storage.Table("diagnosticsledger-azurefl0521", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    tableName: "diagnosticsledger",
  });

  const fleetEventsTopic = new eventgrid.Topic("eg-rbflow-pulumi-azurefl0521", {
    topicName: "eg-rbflow-pulumi-azurefl0521",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    inputSchema: "EventGridSchema",
    tags,
  });

  const fleetConfigStore = new appconfiguration.ConfigurationStore("cfgrbflowazurefl0521-azurefl0521", {
    configStoreName: "cfgrbflowazurefl0521",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: "free",
    },
    disableLocalAuth: false,
    tags,
  });

  return {
    DiagnosticsStorageAccountName: storageAccount.name,
    DiagnosticsArtifactsContainerName: diagnosticsContainer.name,
    DiagnosticsJobsQueueName: diagnosticsJobsQueue.name,
    DiagnosticsLedgerTableName: diagnosticsLedgerTable.name,
    FleetEventsTopicName: fleetEventsTopic.name,
    FleetConfigStoreName: fleetConfigStore.name,
  };
}

```
