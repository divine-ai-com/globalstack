terraform {
  required_version = "= 1.17.1"
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

variable "subscription_id" { type = string }
variable "resource_group_name" { type = string }
variable "run_id" { type = string }
variable "expires_at" { type = string }
variable "revision" { type = string }
variable "location" {
  type    = string
  default = "eastus"
}

resource "azapi_resource" "group" {
  type      = "Microsoft.Resources/resourceGroups@2021-04-01"
  name      = var.resource_group_name
  parent_id = "/subscriptions/${var.subscription_id}"
  location  = var.location
  tags = {
    project  = "globalstack-paired-lifecycle"
    run      = var.run_id
    expires  = var.expires_at
    revision = var.revision
  }
  body = {}
}

output "group_id" { value = azapi_resource.group.id }
