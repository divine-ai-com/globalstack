resource "azapi_resource" "resource_group" {
  type      = "Microsoft.Resources/resourceGroups@2022-09-01"
  name      = var.resource_group_name
  location  = var.location
  parent_id = "/subscriptions/${var.subscription_id}"
  body      = {}
}

resource "azapi_resource" "storage_account" {
  type                      = "Microsoft.Storage/storageAccounts@2023-01-01"
  name                      = var.storage_account_name
  location                  = var.location
  parent_id                 = azapi_resource.resource_group.id
  schema_validation_enabled = false

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
  type                      = "Microsoft.Storage/storageAccounts/blobServices@2023-01-01"
  name                      = "default"
  parent_id                 = azapi_resource.storage_account.id
  schema_validation_enabled = false

  body = {
    properties = {}
  }
}

resource "azapi_resource" "claims_evidence_container" {
  type                      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01"
  name                      = "claims-evidence"
  parent_id                 = azapi_resource.blob_service.id
  schema_validation_enabled = false

  body = {
    properties = {
      publicAccess = "None"
    }
  }
}

resource "azapi_resource" "queue_service" {
  type                      = "Microsoft.Storage/storageAccounts/queueServices@2023-01-01"
  name                      = "default"
  parent_id                 = azapi_resource.storage_account.id
  schema_validation_enabled = false

  body = {
    properties = {}
  }
}

resource "azapi_resource" "claims_jobs_queue" {
  type                      = "Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01"
  name                      = "claims-jobs"
  parent_id                 = azapi_resource.queue_service.id
  schema_validation_enabled = false

  body = {
    properties = {}
  }
}

resource "azapi_resource" "file_service" {
  type                      = "Microsoft.Storage/storageAccounts/fileServices@2023-01-01"
  name                      = "default"
  parent_id                 = azapi_resource.storage_account.id
  schema_validation_enabled = false

  body = {
    properties = {}
  }
}

resource "azapi_resource" "claims_files_share" {
  type                      = "Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01"
  name                      = "claimsfiles"
  parent_id                 = azapi_resource.file_service.id
  schema_validation_enabled = false

  body = {
    properties = {
      shareQuota = 32
    }
  }
}

resource "azapi_resource" "table_service" {
  type                      = "Microsoft.Storage/storageAccounts/tableServices@2023-01-01"
  name                      = "default"
  parent_id                 = azapi_resource.storage_account.id
  schema_validation_enabled = false

  body = {
    properties = {}
  }
}

resource "azapi_resource" "claims_ledger_table" {
  type                      = "Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01"
  name                      = "claimsledger"
  parent_id                 = azapi_resource.table_service.id
  schema_validation_enabled = false

  body = {
    properties = {}
  }
}

resource "azapi_resource" "servicebus_namespace" {
  type                      = "Microsoft.ServiceBus/namespaces@2021-11-01"
  name                      = "sb-claims-terraf-azureter0526"
  location                  = var.location
  parent_id                 = azapi_resource.resource_group.id
  schema_validation_enabled = false

  body = {
    sku = {
      name = "Standard"
    }
    properties = {}
  }
}

resource "azapi_resource" "claims_events_topic" {
  type                      = "Microsoft.ServiceBus/namespaces/topics@2021-11-01"
  name                      = "claims-events"
  parent_id                 = azapi_resource.servicebus_namespace.id
  schema_validation_enabled = false

  body = {
    properties = {
      maxSizeInMegabytes = 1024
    }
  }
}

resource "azapi_resource" "event_grid_topic" {
  type                      = "Microsoft.EventGrid/topics@2022-06-15"
  name                      = "eg-claims-terraf-azureter0526"
  location                  = var.location
  parent_id                 = azapi_resource.resource_group.id
  schema_validation_enabled = false

  body = {
    properties = {
      inputSchema = "EventGridSchema"
    }
  }
}

resource "azapi_resource" "eventhubs_namespace" {
  type                      = "Microsoft.EventHub/namespaces@2024-01-01"
  name                      = "eh-claims-terraf-azureter0526"
  location                  = var.location
  parent_id                 = azapi_resource.resource_group.id
  schema_validation_enabled = false

  body = {
    sku = {
      name     = "Standard"
      capacity = 1
    }
    properties = {}
  }
}

resource "azapi_resource" "claims_stream_eventhub" {
  type                      = "Microsoft.EventHub/namespaces/eventhubs@2024-01-01"
  name                      = "claims-stream"
  parent_id                 = azapi_resource.eventhubs_namespace.id
  schema_validation_enabled = false

  body = {
    properties = {
      partitionCount         = 2
      messageRetentionInDays = 1
    }
  }
}

resource "azapi_resource" "app_configuration_store" {
  type                      = "Microsoft.AppConfiguration/configurationStores@2023-03-01"
  name                      = "cfgclaimsterrafazureter"
  location                  = var.location
  parent_id                 = azapi_resource.resource_group.id
  schema_validation_enabled = false

  body = {
    sku = {
      name = "free"
    }
    properties = {
      disableLocalAuth = false
    }
  }
}

resource "azapi_resource" "claims_audit_subscription" {
  count                     = var.claims_subscription_count
  type                      = "Microsoft.EventGrid/eventSubscriptions@2020-06-01"
  name                      = "claims-audit-${count.index}"
  parent_id                 = azapi_resource.event_grid_topic.id
  schema_validation_enabled = false
  body = {
    properties = {
      destination = {
        endpointType = "WebHook"
        properties = {
          endpointUrl = var.claims_worker_url
        }
      }
    }
  }
}
