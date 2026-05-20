```hcl path="lib/provider.tf"
terraform {
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
  }
}

provider "azapi" {
  use_cli = true
}

data "azapi_client_config" "current" {}
```

```hcl path="lib/variables.tf"
variable "location" {
  type    = string
  default = "eastus"
}
```

```hcl path="lib/main.tf"
locals {
  resource_group_name        = "rg-az-mlopsf-terraf-azureter0520"
  storage_account_name       = "azmlopsfterrafazureter"
  artifacts_container_name   = "feature-artifacts"
  jobs_queue_name            = "feature-jobs"
  files_share_name           = "featurefiles"
  ledger_table_name          = "featureledger"
  service_bus_namespace_name = "sb-mlopsf-terraf-azureter0520"
  service_bus_topic_name     = "feature-events"
  event_grid_topic_name      = "eg-mlopsf-terraf-azureter0520"
  event_hubs_namespace_name  = "eh-mlopsf-terraf-azureter0520"
  event_hub_name             = "feature-stream"
  app_configuration_name     = "cfgmlopsfterrafazureter"
}

resource "azapi_resource" "resource_group" {
  type      = "Microsoft.Resources/resourceGroups@2021-04-01"
  name      = local.resource_group_name
  location  = var.location
  parent_id = "/subscriptions/${data.azapi_client_config.current.subscription_id}"
}

resource "azapi_resource" "storage_account" {
  type      = "Microsoft.Storage/storageAccounts@2023-01-01"
  name      = local.storage_account_name
  location  = var.location
  parent_id = azapi_resource.resource_group.id

  body = {
    kind = "StorageV2"
    sku = {
      name = "Standard_LRS"
    }
    properties = {
      allowBlobPublicAccess    = false
      minimumTlsVersion        = "TLS1_2"
      supportsHttpsTrafficOnly = true
    }
  }
}

resource "azapi_resource" "blob_service" {
  type      = "Microsoft.Storage/storageAccounts/blobServices@2023-01-01"
  name      = "default"
  parent_id = azapi_resource.storage_account.id
}

resource "azapi_resource" "feature_artifacts_container" {
  type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01"
  name      = local.artifacts_container_name
  parent_id = azapi_resource.blob_service.id

  body = {
    properties = {
      publicAccess = "None"
    }
  }
}

resource "azapi_resource" "queue_service" {
  type      = "Microsoft.Storage/storageAccounts/queueServices@2023-01-01"
  name      = "default"
  parent_id = azapi_resource.storage_account.id
}

resource "azapi_resource" "feature_jobs_queue" {
  type      = "Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01"
  name      = local.jobs_queue_name
  parent_id = azapi_resource.queue_service.id

  body = {
    properties = {}
  }
}

resource "azapi_resource" "file_service" {
  type      = "Microsoft.Storage/storageAccounts/fileServices@2023-01-01"
  name      = "default"
  parent_id = azapi_resource.storage_account.id
}

resource "azapi_resource" "feature_files_share" {
  type      = "Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01"
  name      = local.files_share_name
  parent_id = azapi_resource.file_service.id

  body = {
    properties = {
      shareQuota = 32
    }
  }
}

resource "azapi_resource" "table_service" {
  type      = "Microsoft.Storage/storageAccounts/tableServices@2023-01-01"
  name      = "default"
  parent_id = azapi_resource.storage_account.id
}

resource "azapi_resource" "feature_ledger_table" {
  type      = "Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01"
  name      = local.ledger_table_name
  parent_id = azapi_resource.table_service.id

  body = {
    properties = {}
  }
}

resource "azapi_resource" "service_bus_namespace" {
  type      = "Microsoft.ServiceBus/namespaces@2021-11-01"
  name      = local.service_bus_namespace_name
  location  = var.location
  parent_id = azapi_resource.resource_group.id

  body = {
    sku = {
      name = "Standard"
    }
    properties = {}
  }
}

resource "azapi_resource" "feature_events_topic" {
  type      = "Microsoft.ServiceBus/namespaces/topics@2021-11-01"
  name      = local.service_bus_topic_name
  parent_id = azapi_resource.service_bus_namespace.id

  body = {
    properties = {
      maxSizeInMegabytes = 1024
    }
  }
}

resource "azapi_resource" "event_grid_topic" {
  type      = "Microsoft.EventGrid/topics@2022-06-15"
  name      = local.event_grid_topic_name
  location  = var.location
  parent_id = azapi_resource.resource_group.id

  body = {
    properties = {
      inputSchema = "EventGridSchema"
    }
  }
}

resource "azapi_resource" "event_hubs_namespace" {
  type      = "Microsoft.EventHub/namespaces@2024-01-01"
  name      = local.event_hubs_namespace_name
  location  = var.location
  parent_id = azapi_resource.resource_group.id

  body = {
    sku = {
      name     = "Standard"
      capacity = 1
    }
    properties = {}
  }
}

resource "azapi_resource" "feature_stream_hub" {
  type      = "Microsoft.EventHub/namespaces/eventhubs@2024-01-01"
  name      = local.event_hub_name
  parent_id = azapi_resource.event_hubs_namespace.id

  body = {
    properties = {
      partitionCount         = 2
      messageRetentionInDays = 1
    }
  }
}

resource "azapi_resource" "app_configuration_store" {
  type      = "Microsoft.AppConfiguration/configurationStores@2023-03-01"
  name      = local.app_configuration_name
  location  = var.location
  parent_id = azapi_resource.resource_group.id

  body = {
    sku = {
      name = "free"
    }
    properties = {
      disableLocalAuth = false
    }
  }
}
```

```hcl path="lib/outputs.tf"
output "FeatureLakeStorageAccountName" {
  value = local.storage_account_name
}

output "FeatureArtifactsContainerName" {
  value = local.artifacts_container_name
}

output "FeatureJobsQueueName" {
  value = local.jobs_queue_name
}

output "FeatureFilesShareName" {
  value = local.files_share_name
}

output "FeatureLedgerTableName" {
  value = local.ledger_table_name
}

output "FeatureEventsTopicName" {
  value = local.service_bus_topic_name
}

output "FeatureStreamHubName" {
  value = local.event_hub_name
}

output "FeatureConfigStoreName" {
  value = local.app_configuration_name
}
```
