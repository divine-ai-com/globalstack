# Upstream ARM templates

These three unmodified templates come from Microsoft's Azure Quickstart Templates repository. `provenance.json` records the pinned revision, source URLs and SHA-256 digests. The upstream MIT license is included in `LICENSE`.

The conformance tests supply local deployment parameters and verify resource readback and deletion. They also exercise missing scopes and unsupported cross-group scopes. The Key Vault case also reads the deployed secret through its data-plane endpoint. The Event Grid case publishes uniquely identified events and verifies their payloads at a real local HTTP webhook. Negative controls delete the subscription and then configure a wrong destination: publishing still succeeds, but the intended webhook must receive neither event. Restoring the destination must restore delivery.

These checks do not establish live Azure equivalence, Key Vault RBAC enforcement, or storage data-plane behavior. Local Event Grid delivery is synchronous; these tests do not validate Azure retry timing or asynchronous delivery guarantees.

Template updates require a provenance and digest update, review of their license, and a new validation run.
