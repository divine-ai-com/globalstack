# Document PostgreSQL role comparison

The [summary](summary.json) and [redacted lifecycle trace](trace.json) record
an Azure-first run on 2026-11-10 at source revision `50b04dd`. Azure and
GlobalStack accepted the same compiled PostgreSQL and managed-identity Bicep
template and reached `Succeeded`. Azure and local temporary firewall PUTs each
returned HTTP 202. Azure readback returned HTTP 200.

The Azure service-principal administrator connected over verified TLS with an
Entra-scoped token. It created nonadmin worker and ingress roles using Azure's
PostgreSQL helper, migrated the document schema and verified the intended
grants. The local gateway used the same bootstrap SQL with a locally signed
administrator token. It mapped the two locally signed application identities
to separate restricted database logins. Both logins succeeded; ingress outbox
read and worker table creation were denied. The administrator's local backend
login was a restricted database owner, not the privileged catalog owner.

The Azure pilot verified grants as the administrator. It did not run an Azure
Function as the worker or ingress identity. The local test used synthetic
tokens, not tokens issued by Azure. This result establishes a bounded role
bootstrap and local login path, not a live application event or full identity
parity across environments.

Automatic cleanup and an independent Azure CLI inventory found zero resources
and zero deployment records in the preserved pilot group. The disposable local
database and SQL gateway were removed. The USD 12 run envelope raised the
conservative allocation ledger to USD 337 of the authorized USD 500 ceiling.
That amount is not a measured Azure charge.

The private original trace remains in the operator run directory. The
published copy preserves request order, statuses and resource states while
replacing account identifiers, the runner IP, and remaining UUIDs and IP
addresses with opaque aliases. Both SHA-256 hashes are in the summary.
No full document-scenario assertion is promoted by this component run.
