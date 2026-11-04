# Upstream ARM templates

These three unmodified templates come from Microsoft's Azure Quickstart Templates repository. `provenance.json` records the pinned revision, source URLs and SHA-256 digests. The upstream MIT license is included in `LICENSE`.

The conformance tests supply local deployment parameters and verify resource readback and deletion. They also exercise missing scopes and unsupported cross-group scopes. They do not establish live Azure equivalence, successful webhook delivery, Key Vault RBAC enforcement, or storage data-plane behavior.

Template updates require a provenance and digest update, review of their license, and a new validation run.
