variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "bucket_location" {
  type    = string
  default = "US"
}

variable "bucket_name" {
  type = string
}

variable "object_name" {
  type = string
}

variable "object_content" {
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

variable "storage_endpoint" {
  type    = string
  default = "http://127.0.0.1:8765/storage/v1/"
}
