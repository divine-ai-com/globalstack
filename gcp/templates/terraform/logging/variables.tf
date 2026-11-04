variable "project_id" {
  type = string
}

variable "metric_id" {
  type = string
}

variable "metric_filter" {
  type = string
}

variable "access_token" {
  type      = string
  default   = "globalstack-local-token"
  sensitive = true
}

variable "logging_endpoint" {
  type = string
}
