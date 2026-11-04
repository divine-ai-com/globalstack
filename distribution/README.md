# Distribution

This directory defines the release and shipping boundary for the product.

Current release surfaces:

- `apps/emulator/` for the runnable emulator process
- `templates/emulator/` for the first-party container image definition
- `dist/platform-images/` as generated runner/build output, not source
- `../globalstack-verification/` as the sibling verification corpus repo

Product source stays in the main repo. Verification artifacts and historical conformance run logs belong in the sibling verification repo.
