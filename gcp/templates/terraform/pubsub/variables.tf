variable "project_id" {
  type = string
}

variable "topic_name" {
  type = string
}

variable "subscription_name" {
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

variable "pubsub_endpoint" {
  type = string
}
