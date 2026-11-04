# Compute Metadata Module

This module owns bounded Compute Engine metadata APIs needed by provider
handshake flows.

Current scope:

- `GET /compute/v1/projects/{project}/regions`

This is not Compute Engine VM emulation. It is provider metadata needed so IaC
clients can validate regions without calling real Google APIs.
