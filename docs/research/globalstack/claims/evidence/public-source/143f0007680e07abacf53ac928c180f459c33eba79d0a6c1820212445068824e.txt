output "ClaimsEvidenceStorageAccountName" {
  value = azapi_resource.storage_account.name
}

output "ClaimsEvidenceContainerName" {
  value = azapi_resource.claims_evidence_container.name
}

output "ClaimsJobsQueueName" {
  value = azapi_resource.claims_jobs_queue.name
}

output "ClaimsFilesShareName" {
  value = azapi_resource.claims_files_share.name
}

output "ClaimsLedgerTableName" {
  value = azapi_resource.claims_ledger_table.name
}

output "ClaimsEventsTopicName" {
  value = azapi_resource.claims_events_topic.name
}

output "ClaimsStreamHubName" {
  value = azapi_resource.claims_stream_eventhub.name
}

output "ClaimsConfigStoreName" {
  value = azapi_resource.app_configuration_store.name
}

output "ClaimsAuditSubscriptionIds" {
  value = azapi_resource.claims_audit_subscription[*].id
}
