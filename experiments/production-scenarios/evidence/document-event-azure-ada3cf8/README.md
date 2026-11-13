# Paired document infrastructure and scanner component

Clean source revision `ada3cf8e828bd3aadb04fd2af2131fd71eca3529` used the same compiled Bicep templates on Azure and GlobalStack. Only deployment-specific values, including generated resource names and scanner endpoints, differed. The `document-data` template SHA-256 was `ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e`; the `document-events` template SHA-256 was `d5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09`.

| Stage | Azure terminal state | GlobalStack terminal state |
| --- | --- | --- |
| Worker host and native Function | `Succeeded`, health HTTP 200 | `Succeeded`, native worker running |
| Scanner host, app and authentication | `Succeeded` | `Succeeded` |
| Document storage, containers and Blob roles | `Succeeded` | `Succeeded` |
| Storage system topic, identity-scoped dead-letter role and Function subscription | `Succeeded` | `Succeeded` |

The final Event Grid row is the corrected control-plane comparison for [issue #65](https://github.com/divine-ai-com/globalstack/issues/65). The previous local HTTP 501 is absent on this revision. It does not establish that a Blob upload reached the Function or that a failed delivery produced an Azure-equivalent dead-letter blob.
The [machine-readable summary](summary.json) retains each stage's terminal HTTP status and state. Azure's terminal deployment reads returned HTTP 200; GlobalStack's synchronous deployment responses returned HTTP 201. Those protocol differences remain visible even where both terminal states were `Succeeded`.

The actual deployed Function used managed identity to call the native ClamAV/YARA scanner on both targets. The clean, harmless YARA and harmless EICAR cases returned HTTP 200 with the same decisions and hashes after excluding elapsed scan time. Missing Functions host keys returned 401. Revoking the scanner's worker policy produced 403 on both targets; Azure took 42,318 ms to reflect that change while GlobalStack reflected it on the first check. Restoring the policy produced 200 on both targets; Azure took 36,925 ms while GlobalStack again reflected it on the first check. These propagation differences are retained rather than counted as identical timing.

This remains a component comparison. The worker was not configured with the complete document application settings, and no Blob-to-Durable-to-PostgreSQL-to-Search path was executed. The financial scenario, other IaC platforms, Azure Portal screenshots and full-application assertions remain outstanding. The private run directory contains timestamped API observations and a terminal/API recording, not a Portal recording.
The public summary records the hashes and sizes of the 1,011-event private trace and result file so they can be checked against the operator copies without publishing deployment identifiers.

The run lasted from 2026-11-08 14:54:21 to 15:30:06 UTC. Automatic cleanup completed, including Azure's long managed-environment deletion. The cleanup helper reported every owned resource, role and deployment absent, then a separate Azure CLI readback found zero resources and zero deployment records in the preserved resource group. Local containers and networks were removed. The USD 12 conservative budget envelope was marked cleanup-verified; cumulative reserved envelopes, including the earlier USD 20 allowance, were USD 133 of the USD 150 ceiling. These are reservations, not measured billing totals.
