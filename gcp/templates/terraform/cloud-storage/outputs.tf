output "bucket_name" {
  value = google_storage_bucket.capture.name
}

output "bucket_location" {
  value = google_storage_bucket.capture.location
}

output "object_name" {
  value = google_storage_bucket_object.sample.name
}
