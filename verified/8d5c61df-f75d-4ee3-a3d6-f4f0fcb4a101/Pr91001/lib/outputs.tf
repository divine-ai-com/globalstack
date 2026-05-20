output "FeatureLakeStorageAccountName" {
  value = local.storage_account_name
}

output "FeatureArtifactsContainerName" {
  value = local.artifacts_container_name
}

output "FeatureJobsQueueName" {
  value = local.jobs_queue_name
}

output "FeatureFilesShareName" {
  value = local.files_share_name
}

output "FeatureLedgerTableName" {
  value = local.ledger_table_name
}

output "FeatureEventsTopicName" {
  value = local.service_bus_topic_name
}

output "FeatureStreamHubName" {
  value = local.event_hub_name
}

output "FeatureConfigStoreName" {
  value = local.app_configuration_name
}
