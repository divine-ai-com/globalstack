```yaml path="Pulumi.yaml"
name: az-cvflow-pulumi-azurefl0520
runtime: nodejs
main: bin/tap.ts
description: Computer vision inspection intake flow on Azure using Pulumi TypeScript
```

```json path="package.json"
{
  "name": "azure-pulumi-vision-inspection-intake-flow",
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

```ts path="bin/tap.ts"
import * as pulumi from "@pulumi/pulumi";
import { createTapStack } from "../lib/tap-stack";

const stack = createTapStack();

export const InspectionArtifactsStorageAccountName = stack.InspectionArtifactsStorageAccountName;
export const InspectionArtifactsContainerName = stack.InspectionArtifactsContainerName;
export const InspectionBackendPlanName = stack.InspectionBackendPlanName;
export const InspectionFunctionAppName = stack.InspectionFunctionAppName;
export const InspectionBackendHostName = stack.InspectionBackendHostName;
export const InspectionMetadataPostgresServerName = stack.InspectionMetadataPostgresServerName;
export const InspectionMetadataPostgresDatabaseName = stack.InspectionMetadataPostgresDatabaseName;
export const InspectionEventTopicName = stack.InspectionEventTopicName;
export const InspectionGatewayServiceName = stack.InspectionGatewayServiceName;
export const InspectionGatewayApiName = stack.InspectionGatewayApiName;
export const InspectionGatewayUrl = stack.InspectionGatewayUrl;
export const InspectionMonitoringWorkspaceName = stack.InspectionMonitoringWorkspaceName;
```

```ts path="lib/tap-stack.ts"
import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as web from "@pulumi/azure-native/web";
import * as dbforpostgresql from "@pulumi/azure-native/dbforpostgresql";
import * as eventgrid from "@pulumi/azure-native/eventgrid";
import * as apimanagement from "@pulumi/azure-native/apimanagement";
import * as operationalinsights from "@pulumi/azure-native/operationalinsights";

export interface TapStackOutputs {
  InspectionArtifactsStorageAccountName: pulumi.Output<string>;
  InspectionArtifactsContainerName: pulumi.Output<string>;
  InspectionBackendPlanName: pulumi.Output<string>;
  InspectionFunctionAppName: pulumi.Output<string>;
  InspectionBackendHostName: pulumi.Output<string>;
  InspectionMetadataPostgresServerName: pulumi.Output<string>;
  InspectionMetadataPostgresDatabaseName: pulumi.Output<string>;
  InspectionEventTopicName: pulumi.Output<string>;
  InspectionGatewayServiceName: pulumi.Output<string>;
  InspectionGatewayApiName: pulumi.Output<string>;
  InspectionGatewayUrl: pulumi.Output<string>;
  InspectionMonitoringWorkspaceName: pulumi.Output<string>;
}

export function createTapStack(): TapStackOutputs {
  const location = "eastus";
  const deploymentSuffix = "azurefl0520";
  const tags = {
    Environment: deploymentSuffix,
    Project: "vision-inspection-intake",
    Workload: "computer-vision",
  };

  const resourceGroup = new resources.ResourceGroup("rg-az-cvflow-pulumi-azurefl0520", {
    resourceGroupName: "rg-az-cvflow-pulumi-azurefl0520",
    location,
    tags,
  });

  const storageAccount = new storage.StorageAccount("azcvflowpulazurefl-azurefl0520", {
    accountName: "azcvflowpulazurefl",
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

  const artifactsContainer = new storage.BlobContainer("inspection-artifacts-azurefl0520", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    containerName: "inspection-artifacts",
    publicAccess: "None",
  });

  const inspectionPlan = new web.AppServicePlan("asp-cvflow-pulumi-azurefl0520", {
    name: "asp-cvflow-pulumi-azurefl0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kind: "functionapp",
    reserved: false,
    sku: {
      name: "Y1",
      tier: "Dynamic",
    },
    tags,
  });

  const inspectionFunction = new web.WebApp("func-cvflow-pulumi-azurefl0520", {
    name: "func-cvflow-pulumi-azurefl0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    kind: "functionapp",
    httpsOnly: true,
    serverFarmId: inspectionPlan.id,
    siteConfig: {
      appSettings: [
        { name: "FUNCTIONS_WORKER_RUNTIME", value: "node" },
        { name: "FUNCTIONS_EXTENSION_VERSION", value: "~4" },
        { name: "INSPECTION_ARTIFACTS_CONTAINER", value: "inspection-artifacts" },
      ],
    },
    tags,
  }, { dependsOn: [inspectionPlan] });

  const postgresServer = new dbforpostgresql.Server("pg-cvflow-pulumi-azurefl0520", {
    serverName: "pg-cvflow-pulumi-azurefl0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    administratorLogin: "pgadminuser",
    administratorLoginPassword: "InspectionAdmin1!",
    version: "16",
    sku: {
      name: "Standard_B1ms",
      tier: "Burstable",
    },
    storage: {
      storageSizeGB: 32,
    },
    backup: {
      backupRetentionDays: 7,
      geoRedundantBackup: "Disabled",
    },
    tags,
  });

  const postgresDatabase = new dbforpostgresql.Database("inspectionmeta-azurefl0520", {
    databaseName: "inspectionmeta",
    resourceGroupName: resourceGroup.name,
    serverName: postgresServer.name,
    charset: "UTF8",
    collation: "en_US.utf8",
  }, { dependsOn: [postgresServer] });

  const inspectionEventsTopic = new eventgrid.Topic("eg-cvflow-pulumi-azurefl0520", {
    topicName: "eg-cvflow-pulumi-azurefl0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    inputSchema: "EventGridSchema",
    tags,
  });

  const gatewayService = new apimanagement.ApiManagementService("apim-cvflow-pulumi-azurefl0520", {
    serviceName: "apim-cvflow-pulumi-azurefl0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    publisherEmail: "platform@example.com",
    publisherName: "Vision Inspection Platform",
    sku: {
      name: "Developer",
      capacity: 1,
    },
    tags,
  });

  const inspectionGatewayApi = new apimanagement.Api("inspection-intake-azurefl0520", {
    apiId: "inspection-intake",
    resourceGroupName: resourceGroup.name,
    serviceName: gatewayService.name,
    displayName: "inspection-intake",
    path: "inspection-intake",
    protocols: ["https"],
    serviceUrl: pulumi.interpolate`https://${inspectionFunction.defaultHostName}/api/inspection-intake`,
    subscriptionRequired: false,
  }, { dependsOn: [gatewayService, inspectionFunction] });

  const monitoringWorkspace = new operationalinsights.Workspace("ws-cvflow-pulumi-azurefl0520", {
    workspaceName: "ws-cvflow-pulumi-azurefl0520",
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
      name: "PerGB2018",
    },
    retentionInDays: 30,
    publicNetworkAccessForIngestion: "Enabled",
    publicNetworkAccessForQuery: "Enabled",
    tags,
  });

  return {
    InspectionArtifactsStorageAccountName: storageAccount.name,
    InspectionArtifactsContainerName: artifactsContainer.name,
    InspectionBackendPlanName: inspectionPlan.name,
    InspectionFunctionAppName: inspectionFunction.name,
    InspectionBackendHostName: inspectionFunction.defaultHostName,
    InspectionMetadataPostgresServerName: postgresServer.name,
    InspectionMetadataPostgresDatabaseName: postgresDatabase.name,
    InspectionEventTopicName: inspectionEventsTopic.name,
    InspectionGatewayServiceName: gatewayService.name,
    InspectionGatewayApiName: inspectionGatewayApi.name,
    InspectionGatewayUrl: gatewayService.gatewayUrl,
    InspectionMonitoringWorkspaceName: monitoringWorkspace.name,
  };
}
```
