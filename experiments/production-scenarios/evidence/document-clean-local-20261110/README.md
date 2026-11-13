# Local clean-document traversal

The native local worker received a production Event Grid event after a harmless text upload. Its deployed scanner returned a clean decision, the Function committed PostgreSQL metadata, and one outbox revision reached the deployed Search service over a verified TLS route with managed-identity authorization. A subsequent Search query found one matching document. The earlier outbox revision was superseded. All disposable local containers were removed.

The harness registered document ownership directly in PostgreSQL before upload. This is setup for this slice, not evidence that the production ingress API works. The private run report is `reports/production-scenarios/local-document-search-verified-20261110/result.json`; this public summary omits identifiers and worker logs. The source revision was `2e87683`.

This is local evidence. Live Azure comparison, malicious-file handling, projection indexer execution, failure queue delivery, and complete scenario acceptance remain open in [issue #91](https://github.com/divine-ai-com/globalstack/issues/91).
