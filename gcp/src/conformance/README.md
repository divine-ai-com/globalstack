# Conformance Foundation

This package contains provider-wide conformance utilities:

- run context and resource naming
- cleanup stack execution
- capture writing
- response sanitization

It must not contain service-specific API behavior. Service-specific capture
steps belong in `gcp/scripts/capture/` and service-specific API wrappers belong
under `gcp/src/services/<service>/`.
