# Document worker and PostgreSQL paired diagnostic

The same compiled host, PostgreSQL, and worker application templates were deployed to Azure and GlobalStack from source revision `2088045fa3b4cde4e703974edc0f94dc26b315bb`. Both live Functions workers returned HTTP 200 from the database diagnostic. Each reported the same restricted worker role and zero accessible document records. The diagnostic uses the application SQL pool and a managed-identity token. It does not prove the complete document processing workflow.

| Stage | Azure | GlobalStack |
| --- | --- | --- |
| Host deployment | Succeeded | Succeeded |
| PostgreSQL and identities deployment | Succeeded | Succeeded |
| Worker app deployment | Succeeded | Succeeded |
| Worker health | HTTP 200 | HTTP 200 |
| Worker SQL diagnostic | HTTP 200, restricted role, zero documents | HTTP 200, same role and count |
| Host and app validation calls | HTTP 200 | HTTP 501 `GlobalStackValidationNotImplemented` |
| Cleanup | Worker and PostgreSQL absent; subscription inventory zero | Local runtime and disposable database removed |

The pilot used temporary exact-IP firewall rules so the worker and test runner could reach the database. It did not test private-network deployment. The temporary Azure resources were removed after the observation. The budget figure in `summary.json` is a conservative allowance ledger, not an Azure charge or billing estimate. The private raw trace stays in the operator workspace because it contains detailed infrastructure responses. `summary.json` contains only the redacted claims reviewed for publication.

The remaining scenario gates include Blob upload, Event Grid delivery, ClamAV and YARA scans, metadata persistence, Search indexing and query, rejection behavior, security controls, Portal evidence, and full cleanup across the complete stack. The second financial-research scenario remains separate work.
