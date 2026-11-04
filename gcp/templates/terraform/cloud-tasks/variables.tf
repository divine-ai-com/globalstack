variable "project_id" {
  type = string
}

variable "location" {
  type    = string
  default = "us-central1"
}

variable "queue_id" {
  type = string
}

variable "access_token" {
  type      = string
  default   = "globalstack-local-token"
  sensitive = true
}

variable "cloud_tasks_endpoint" {
  type = string
}
