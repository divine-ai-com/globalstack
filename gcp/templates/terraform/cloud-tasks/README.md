# Terraform Cloud Tasks Template

This template exercises the Google provider against GlobalStack GCP Cloud Tasks
through `cloud_tasks_custom_endpoint`.

It creates a queue with rate limits, retry config, and logging config. The
runner then creates an HTTP task through the local API and dispatches it to a
real local receiver before checking no-drift plan and destroy.
