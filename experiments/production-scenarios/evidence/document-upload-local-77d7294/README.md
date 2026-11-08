# Local document upload component capture

Clean source revision `77d729462a879da32f8092674ccfea542effa9c6` deployed the worker host, document account, worker app and Event Grid subscription with the compiled Bicep hashes in [summary.json](summary.json). The worker used Blob-backed host keys. It reported healthy, exposed the opt-in upload diagnostic and wrote a test Blob with its managed identity. The deployed Event Grid subscription matched that BlobCreated event and attempted delivery to `documentUploaded`.

The Function returned HTTP 500. This component probe omits downstream application settings and registration. The result is a failed delivery attempt, not document processing or search. It is also local-only. No Azure event-delivery comparison, dead-letter result, or full workflow assertion is claimed. Local runtime and worker cleanup completed. The private trace stays outside the repository because it contains generated resource details and host-management observations.
