# Local authenticated document upload and search

One disposable GlobalStack run used a real app-only Microsoft Entra token against the deployed document API process. The API denied missing and forged tokens with HTTP 401, accepted an authenticated upload with HTTP 202, and registered the owner in PostgreSQL. The Blob event reached the production Function, the deployed ClamAV/YARA scanner returned clean, the worker committed metadata and delivered its outbox revision to Search. Both the push and projection indexes returned the document. The authenticated API then returned the document state and one search result. All local containers were removed.

The isolated local app retrieved the token's public Microsoft signing key through a scoped platform transport. No private signing key or access token is in this evidence. The private report is `reports/production-scenarios/local-document-ingress-auth-denials-20261110/result.json`; this public summary omits identifiers and raw logs. The source revision was `69da7be`.

The API calls used the native process origin. They did not pass through the Container App front door, so ingress policy parity is unproven. No matching combined Azure run was made. Service Bus failure delivery, delegated-user behavior, private networking, and complete scenario acceptance remain open.
