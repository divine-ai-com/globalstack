terraform {
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "= 2.13.0"
    }
  }
}

provider "azapi" {
  use_cli         = true
  subscription_id = var.subscription_id
}

data "azapi_client_config" "current" {}
