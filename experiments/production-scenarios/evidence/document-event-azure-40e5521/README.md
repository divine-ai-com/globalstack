# Document Event Grid deployment comparison

Attempted source revision: `40e55215441ff58ec61157f6a3a0b6dbbe4559d4`.

The pinned Bicep compiler produced one `document-events` ARM template with SHA-256 `d5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09`. The runner submitted that template to Azure first, then GlobalStack, changing only deployment-specific parameters. The separate `document-data` template also deployed on both targets.

| Target | Final deployment response | Observation |
| --- | --- | --- |
| Azure | HTTP 200, `Succeeded` | The Storage system topic, identity-scoped dead-letter role and Azure Function event subscription were accepted. This does not show an event delivery. |
| GlobalStack | HTTP 501, `GlobalStackEventDeliveryNotImplemented` | `Dead-letter destinations and expiring subscriptions are not implemented.` The deployment was rejected. |

The module uses `deadLetterWithResourceIdentity` with a system-assigned Event Grid topic identity and a Storage Blob destination. It is defined in [the attempted Bicep module](../../document-infra/document-events.bicep). The Azure response establishes acceptance for this specific deployment shape. It does not establish dead-letter blob contents, timing, negative authorization behavior, or any document-processing success.

After [the local implementation](https://github.com/divine-ai-com/globalstack/commit/f41299b17628974cb80039a29f59b6ed1f763771), [the frozen-template local replay](local-after-6c0be66.json) returned `Succeeded` for both modules with the same template hashes. That replay uses a synthetic Function discovery adapter to isolate control-plane acceptance. It does not prove the real Functions container or business handler on this corrected revision. Separate local tests exercise exhausted-event Blob persistence, the delay and role revocation. Azure runtime parity for those behaviors remains unmeasured.

The runner recorded this attempt under a private directory that contains deployment identifiers. Its first cleanup and detached watchdog reported recovery required. Manual recovery used the ownership-checked worker cleanup helper to remove the last deployment record, then reran the combined document/worker/scanner cleanup helper. Both the helper and a fresh Azure CLI inventory confirmed zero task resources and zero deployment records in the preserved operator group at 2026-11-08 14:48 UTC. The USD 12 conservative envelope was then marked cleanup-verified. This was a recovered teardown, not an automatic cleanup pass. The private trace retains both failures and the recovery context.
