output "secret_id" {
  value = google_secret_manager_secret.app_config.secret_id
}

output "secret_name" {
  value = google_secret_manager_secret.app_config.name
}

output "secret_version_name" {
  value = google_secret_manager_secret_version.current.name
}
