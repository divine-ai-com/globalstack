# Security

GlobalStack is a local development emulator. Its deterministic identities, local tokens, and service credentials emulate API behavior. They are not a production authentication boundary. Do not expose its endpoints to the internet or use production credentials or personal data in test workloads.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/divine-ai-com/globalstack/security/advisories/new). Include the affected commit, a minimal reproduction using synthetic data, impact, and any suggested mitigation. Do not put credentials or exploit details for an unresolved issue into a public issue or PR.

The project is in development. Security fixes target `main`; no supported stable-release series or response-time guarantee is established yet.

## Runtime boundaries

- Direct host startup binds to loopback by default. `GLOBALSTACK_HOST` explicitly overrides the full emulator's bind address; `GLOBALSTACK_ARM_HOST` overrides ARM separately.
- Containers listen on their internal interfaces. Publish host ports on `127.0.0.1`, as shown in the quickstart. Generated optional emulator compose files also publish on loopback.
- ARM request bodies are limited to 8 MiB. ARM internal errors return a generic response without exception details. Other service-specific parsers still need a systematic size and timeout review.
- Optional Kubernetes support creates privileged containers. The development compose stack mounts the Docker socket. Both require a trusted, disposable development host and must not process untrusted submissions on a shared host.
- Workflow and webhook emulation can make outbound requests. Network egress restrictions and untrusted-workload isolation remain operator responsibilities. This project is not a sandbox for hostile IaC.
- Management state is ephemeral. Data-plane backends can retain state in their own containers or volumes; dispose of only the resources owned by your run.

## Secrets and evidence

Never commit cloud credentials, personal data, private keys, `.env` files, or unsanitized logs. Use synthetic identifiers and data in reproductions. The generic Azure capture command redacts sensitive fields, common credential-bearing URLs, email addresses, and account identifiers; it omits unstructured CLI diagnostics and non-JSON response bodies. Sanitization is not anonymization: review captures manually before committing them. Other capture utilities require their own review.

GitHub secret scanning and push protection are enabled. The Gitleaks workflow scans reachable Git history. `.gitleaksignore` contains only reviewed historical false-positive fingerprints: synthetic resource names, code expressions, and the published Azurite development key. It does not exempt whole directories or arbitrary future secrets. Any change to these exceptions requires maintainer review.

## Automated checks

PRs must pass runtime tests, repository policy, issue acceptance, and the security workflow. CodeQL analyzes JavaScript and TypeScript with `security-extended`; high and critical findings fail the security gate. Lower-severity results remain in GitHub code scanning for review. Dependency audit and dependency review block known moderate-or-higher advisories. New dependencies must use a license from the configured review list or receive a reviewed policy change.

Checks run on PRs, on `main`, and weekly. GitHub Actions use pinned commits and limited token permissions. Privileged metadata workflows execute trusted default-branch code only. CI does not run paid cloud captures or model API calls.

Passing automated checks does not certify Azure compatibility, freedom from vulnerabilities, or legal or regulatory compliance. See [the security review](docs/product/SECURITY-REVIEW.md) for evidence and remaining work.
