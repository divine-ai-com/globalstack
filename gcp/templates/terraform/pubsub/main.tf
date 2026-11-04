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
  project                = var.project_id
  access_token           = var.access_token
  pubsub_custom_endpoint = var.pubsub_endpoint
}

resource "google_pubsub_topic" "topic" {
  name = var.topic_name

  labels = var.labels
}

resource "google_pubsub_subscription" "subscription" {
  name  = var.subscription_name
  topic = google_pubsub_topic.topic.name

  ack_deadline_seconds       = 20
  message_retention_duration = "604800s"

  labels = var.labels
}
