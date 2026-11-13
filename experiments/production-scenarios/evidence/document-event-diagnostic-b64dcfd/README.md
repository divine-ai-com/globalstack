# Local native document event diagnostic

This [clean-source capture](summary.json) used revision `b64dcfd41f1ed9928307a44c24f11c84aa5f89d3` and a pinned local Functions image. The original document data and production Event Grid template hashes match earlier captures; a separate diagnostic module creates the marker container and a second subscription. No Azure resource was created.

The native worker uploaded a bounded text fixture through managed-identity Blob access and received HTTP 201. Its BlobCreated event reached the `document-diagnostic` subscription, invoked a native Function, and wrote a marker keyed by the source Blob name and ETag. The worker read that marker back with HTTP 200. The original `document-revisions` subscription remained deployed and entered retry state after its production handler returned HTTP 500. That handler still lacks the downstream settings needed for the full document workflow.

The local worker and diagnostic resources were disposed. This run proves a local event-to-Function-to-Blob path for this fixture. Azure delivery, full document processing, indexing, retries and dead lettering still need paired tests. The raw local report remains in the private run directory because it contains generated resource details.
