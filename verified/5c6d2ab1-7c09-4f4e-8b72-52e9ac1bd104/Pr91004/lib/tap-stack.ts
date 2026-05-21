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
