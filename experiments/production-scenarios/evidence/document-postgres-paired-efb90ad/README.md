# PostgreSQL deployment and cleanup pair

At source revision `efb90ad`, the unchanged compiled Entra-only PostgreSQL template reached `Succeeded` in Azure, creating the Flexible Server, administrator and `documents` database. GlobalStack rejected it with `MissingRequiredParameter`, because its server PUT validation still requires a password administrator. This is a concrete deployment mismatch after the earlier provider-level validation matched.

The first cleanup pass deleted the Azure server and deployment record but reported incomplete cleanup because one resource-group inventory read still listed a child. The detached watchdog also reported recovery required. A later ownership-checked recovery found the server and deployment absent, confirmed zero resources in the preserved pilot group, and marked the USD 12 allocation cleanup-verified. `result.json` retains the original failure; `recovery.json` records the later verification. The authorized total is USD 200, the conservatively allocated total is USD 181, and actual Azure billing is not measured here.

This probe did not initialize SQL, connect a managed identity, run the document application, capture Azure Portal images, or demonstrate full workflow parity. The public database network setting is provisional and does not satisfy the scenario's private-network target.
