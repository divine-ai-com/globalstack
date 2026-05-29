output "queue_id" {
  value = google_cloud_tasks_queue.workflow.name
}

output "queue_name" {
  value = google_cloud_tasks_queue.workflow.id
}
