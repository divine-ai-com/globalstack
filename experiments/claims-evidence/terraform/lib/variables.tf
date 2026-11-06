variable "subscription_id" {
  type = string
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "resource_group_name" {
  type    = string
  default = "rg-az-claims-terraf-azureter0526"
}

variable "storage_account_name" {
  type    = string
  default = "azclaimsterrafazureter"
}

variable "claims_worker_url" {
  type = string
}

variable "claims_subscription_count" {
  type    = number
  default = 1
  validation {
    condition     = contains([0, 1, 2], var.claims_subscription_count)
    error_message = "The local control experiment supports zero, one or two subscriptions."
  }
}
