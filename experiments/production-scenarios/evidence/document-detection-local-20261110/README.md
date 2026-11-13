# Local detected-document traversal

Two separate disposable runs sent harmless YARA and EICAR markers through the production document event path. In each run, the deployed scanner detected the marker, the worker stored a `DETECTED` result, and a quarantine Blob contained bytes matching the uploaded source hash. Push and projection Search queries returned no matching document. The projection indexer completed, and all local containers were removed.

The private run reports are `reports/production-scenarios/local-document-yara-20261110/result.json` and `reports/production-scenarios/local-document-clamav-20261110/result.json`. This public summary omits identifiers and raw logs. The source revision was `2f68429`. Owner access was registered directly by the harness before upload. These runs do not establish live Azure parity or complete scenario acceptance.
