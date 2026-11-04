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
  project                     = var.project_id
  access_token                = var.access_token
  cloud_tasks_custom_endpoint = var.cloud_tasks_endpoint
}

resource "google_cloud_tasks_queue" "workflow" {
  name     = var.queue_id
  location = var.location

  rate_limits {
    max_concurrent_dispatches = 10
    max_dispatches_per_second = 5
  }

  retry_config {
    max_attempts       = 3
    max_backoff        = "30s"
    max_doublings      = 2
    max_retry_duration = "120s"
    min_backoff        = "1s"
  }

  stackdriver_logging_config {
    sampling_ratio = 1.0
  }
}
