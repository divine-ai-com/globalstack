output "metric_id" {
  value = google_logging_metric.workflow_errors.name
}

output "metric_filter" {
  value = google_logging_metric.workflow_errors.filter
}
