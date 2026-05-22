# Security

## Secrets

- Do not commit credentials, tokens, private keys, or `.env` files.
- `GLOBALSTACK_AUTH_TOKEN` must be injected at runtime, not stored in source.
- Real Azure and AWS credentials must remain outside the repo.

## Evidence Safety

- Real Azure capture fixtures must stay sanitized.
- Do not widen fixture contents beyond what is needed for conformance evidence.

## Reporting

If a change affects authentication, request routing, or cleanup safety, treat it as a security-sensitive review area and validate the fail-closed behavior before merging.
