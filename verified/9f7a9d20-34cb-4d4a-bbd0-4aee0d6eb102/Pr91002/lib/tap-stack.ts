import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as servicebus from "@pulumi/azure-native/servicebus";
import * as eventgrid from "@pulumi/azure-native/eventgrid";
import * as eventhub from "@pulumi/azure-native/eventhub";
import * as appconfiguration from "@pulumi/azure-native/appconfiguration";

export interface TapStackOutputs {
  RobotTelemetryStorageAccountName: pulumi.Output<string>;
  RobotArtifactsContainerName: pulumi.Output<string>;
  RobotJobsQueueName: pulumi.Output<string>;
  RobotFilesShareName: pulumi.Output<string>;
  RobotLedgerTableName: pulumi.Output<string>;
  RobotEventsTopicName: pulumi.Output<string>;
  RobotTelemetryHubName: pulumi.Output<string>;
  RobotFleetConfigStoreName: pulumi.Output<string>;
}

export function createTapStack(): TapStackOutputs {
  const location = "eastus";

  const resourceGroup = new resources.ResourceGroup("rg-az-roboti-pulumi-azurepul0520", {
    resourceGroupName: "rg-az-roboti-pulumi-azurepul0520",
    location,
  });

  const storageAccount = new storage.StorageAccount("azrobotipulumiazurepul-azurepul0520", {
    accountName: "azrobotipulumiazurepul",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kind: "StorageV2",
    sku: {
      name: "Standard_LRS",
    },
    allowBlobPublicAccess: false,
    minimumTlsVersion: "TLS1_2",
    enableHttpsTrafficOnly: true,
  });

  const artifactsContainer = new storage.BlobContainer("robot-artifacts-azurepul0520", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    containerName: "robot-artifacts",
    publicAccess: "None",
  });

  const jobsQueue = new storage.Queue("robot-jobs-azurepul0520", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    queueName: "robot-jobs",
  });

  const filesShare = new storage.FileShare("robotfiles-azurepul0520", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    shareName: "robotfiles",
    shareQuota: 32,
  });

  const ledgerTable = new storage.Table("robotledger-azurepul0520", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    tableName: "robotledger",
  });

  const serviceBusNamespace = new servicebus.Namespace("sb-roboti-pulumi-azurepul0520", {
    namespaceName: "sb-roboti-pulumi-azurepul0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: "Standard",
      tier: "Standard",
    },
  });

  const robotEventsTopic = new servicebus.Topic("robot-events-azurepul0520", {
    namespaceName: serviceBusNamespace.name,
    resourceGroupName: resourceGroup.name,
    topicName: "robot-events",
    maxSizeInMegabytes: 1024,
  });

  new eventgrid.Topic("eg-roboti-pulumi-azurepul0520", {
    topicName: "eg-roboti-pulumi-azurepul0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    inputSchema: "EventGridSchema",
  });

  const eventHubsNamespace = new eventhub.Namespace("eh-roboti-pulumi-azurepul0520", {
    namespaceName: "eh-roboti-pulumi-azurepul0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: "Standard",
      tier: "Standard",
      capacity: 1,
    },
  });

  const robotStreamHub = new eventhub.EventHub("robot-stream-azurepul0520", {
    eventHubName: "robot-stream",
    namespaceName: eventHubsNamespace.name,
    resourceGroupName: resourceGroup.name,
    partitionCount: 2,
    messageRetentionInDays: 1,
  });

  const appConfigStore = new appconfiguration.ConfigurationStore("cfgrobotipulumiazurepul-azurepul0520", {
    configStoreName: "cfgrobotipulumiazurepul",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: "free",
    },
    disableLocalAuth: false,
  });

  return {
    RobotTelemetryStorageAccountName: storageAccount.name,
    RobotArtifactsContainerName: artifactsContainer.name,
    RobotJobsQueueName: jobsQueue.name,
    RobotFilesShareName: filesShare.name,
    RobotLedgerTableName: ledgerTable.name,
    RobotEventsTopicName: robotEventsTopic.name,
    RobotTelemetryHubName: robotStreamHub.name,
    RobotFleetConfigStoreName: appConfigStore.name,
  };
}
