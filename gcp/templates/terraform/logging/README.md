# Terraform Cloud Logging Template

This template exercises the Google provider against GlobalStack GCP Cloud
Logging through `logging_custom_endpoint`.

It creates a log-based metric. The runner writes structured log entries through
the local Logging API and verifies filtered read behavior before checking
no-drift plan and destroy.
