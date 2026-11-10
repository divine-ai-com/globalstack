# Document PostgreSQL SQL comparison

The [summary](summary.json) and [redacted lifecycle trace](trace.json) record an
Azure-first run on 2026-11-10. Both targets accepted the same compiled
PostgreSQL Bicep template with HTTP 201 and reached `Succeeded`. Each accepted
its temporary single-address firewall rule with HTTP 202. Azure readback
returned HTTP 200. The different source IP values reflect the Azure runner's
public address and the local SQL gateway's loopback address.

The Azure service-principal administrator connected with an Entra-scoped token
over verified TLS. The local gateway accepted a locally signed token for the
same administrator identity over verified TLS. Each SQL path ran the unchanged
document schema migration and found all four expected tables. The local SQL
path used an operator-managed PostgreSQL login behind the gateway. This is a
bounded SQL client and schema comparison, not proof of identical Azure token
issuance or the complete PostgreSQL service.

Automatic cleanup removed the test resources and deployment record. An
independent Azure CLI inventory found zero resources and zero deployments in
the preserved pilot resource group. The local SQL listener and disposable
PostgreSQL container were removed. The USD 12 run envelope raised the
conservative allocation ledger to USD 325 of the authorized USD 500 ceiling.
That allocation is not a measured Azure charge.

The trace retains request order, statuses, error codes, and resource states.
The private original remains in the operator run directory. The published
copy replaces account identifiers, the runner IP, and remaining UUIDs and IP
addresses with opaque aliases. Both SHA-256 hashes are in the summary.

The application worker and ingress have not used their nonadmin SQL identities
through this gateway. Blob ingestion, malware scanning, outbox processing,
Search indexing, private networking, and the full document workflow were not
tested by this run. None of the 101 full-scenario assertions is promoted by
this component result.
