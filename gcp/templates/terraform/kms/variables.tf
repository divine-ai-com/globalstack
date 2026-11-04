variable "project_id" {
  type = string
}

variable "location" {
  type    = string
  default = "global"
}

variable "key_ring_id" {
  type = string
}

variable "crypto_key_id" {
  type = string
}

variable "labels" {
  type = map(string)
}

variable "access_token" {
  type      = string
  default   = "globalstack-local-token"
  sensitive = true
}

variable "kms_endpoint" {
  type = string
}
