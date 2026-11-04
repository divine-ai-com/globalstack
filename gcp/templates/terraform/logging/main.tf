terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project                 = var.project_id
  access_token            = var.access_token
  logging_custom_endpoint = var.logging_endpoint
}

resource "google_logging_metric" "workflow_errors" {
  name        = var.metric_id
  description = "GlobalStack conformance workflow error counter"
  filter      = var.metric_filter

  metric_descriptor {
    display_name = "GlobalStack workflow errors"
    metric_kind  = "DELTA"
    value_type   = "INT64"
  }
}
