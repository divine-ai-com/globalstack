output "key_ring_id" {
  value = google_kms_key_ring.app.name
}

output "key_ring_name" {
  value = google_kms_key_ring.app.id
}

output "crypto_key_id" {
  value = google_kms_crypto_key.app_config.name
}

output "crypto_key_name" {
  value = google_kms_crypto_key.app_config.id
}
