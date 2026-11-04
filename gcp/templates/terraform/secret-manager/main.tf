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
  project                        = var.project_id
  access_token                   = var.access_token
  secret_manager_custom_endpoint = var.secret_manager_endpoint
}

resource "google_secret_manager_secret" "app_config" {
  secret_id = var.secret_id

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret_version" "current" {
  secret      = google_secret_manager_secret.app_config.id
  secret_data = jsonencode(var.secret_payload)
}
