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
  project             = var.project_id
  access_token        = var.access_token
  kms_custom_endpoint = var.kms_endpoint
}

resource "google_kms_key_ring" "app" {
  name     = var.key_ring_id
  location = var.location
}

resource "google_kms_crypto_key" "app_config" {
  name     = var.crypto_key_id
  key_ring = google_kms_key_ring.app.id
  purpose  = "ENCRYPT_DECRYPT"

  labels = var.labels
}
