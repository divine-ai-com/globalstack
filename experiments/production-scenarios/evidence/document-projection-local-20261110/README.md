# Local projection-indexer traversal

The production clean-document path completed locally, including the scanner, PostgreSQL, outbox, and push Search index. An explicit run of the deployed projection indexer returned HTTP 202. Its completed status was `success` with one processed item, and a query against the projection index returned the document. The local run cleaned up all disposable containers.

The private report is `reports/production-scenarios/local-document-projection-verified-20261110/result.json`. This public summary omits identifiers and raw logs. The local Search indexer currently reads Blob state inside the emulator process, so this run does not establish parity of Search-to-Blob HTTP interactions. Live Azure comparison, production ingress, malicious-file handling, and Service Bus failure delivery remain open.
