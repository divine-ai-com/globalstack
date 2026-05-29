variable "project_id" {
  type = string
}

variable "secret_id" {
  type = string
}

variable "secret_payload" {
  type = object({
    run_id  = string
    purpose = string
  })
}

variable "labels" {
  type = map(string)
}

variable "access_token" {
  type      = string
  default   = "globalstack-local-token"
  sensitive = true
}

variable "secret_manager_endpoint" {
  type = string
}
