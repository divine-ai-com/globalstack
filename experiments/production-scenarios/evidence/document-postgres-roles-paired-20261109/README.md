# Document PostgreSQL role pilot

The [summary](summary.json) and [redacted HTTP trace](trace.json) record an Azure-first run of the same compiled PostgreSQL and user-assigned-identity Bicep template on Azure and GlobalStack. Both ARM deployments reached `Succeeded`. A temporary single-IP firewall-rule PUT returned 202 on Azure and 501 (`GlobalStackResourceTypeNotEmulated`) locally.

On Azure, the pilot service-principal administrator connected to `documents` with an Entra token over verified TLS. The bootstrap created separate nonadmin roles mapped to the deployed worker and ingress identities. It applied the document schema and grants. A SQL readback found the four document tables and confirmed worker read access to `document_access`, worker insert access to `document_outbox`, and ingress insert access to `document_access`. It also confirmed that ingress cannot read `document_outbox`.

The local in-memory ARM replay did not expose a PostgreSQL wire-protocol endpoint or Entra SQL authentication, so local SQL was not attempted. The runner exited with status 1 by design: a successful Azure bootstrap is not a paired SQL conformance pass. No document was uploaded and no worker or ingress application process connected to either database. The pilot's public firewall rule does not meet the scenario's private-network requirement.

The cleanup watchdog removed the firewall rule, server, both identities and deployment record. A separate Azure CLI readback found zero resources and zero deployments in the preserved pilot group. The USD 12 run envelope brought the conservative allocation ledger to USD 289 of the authorized USD 350 ceiling. These allocations are not measured Azure charges.

The private original trace is retained in the operator run directory. Its SHA-256 is in the summary. The published trace preserves request order, response status, error code and resource state while replacing account identifiers, the runner IP and remaining UUIDs with stable opaque aliases. No production credential or document was used.
