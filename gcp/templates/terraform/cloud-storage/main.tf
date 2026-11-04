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
  region                  = var.region
  access_token            = var.access_token
  storage_custom_endpoint = var.storage_endpoint
}

resource "google_storage_bucket" "capture" {
  name                        = var.bucket_name
  location                    = var.bucket_location
  force_destroy               = true
  uniform_bucket_level_access = true

  labels = var.labels

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket_object" "sample" {
  name         = var.object_name
  bucket       = google_storage_bucket.capture.name
  content      = jsonencode(var.object_content)
  content_type = "application/json"
}
