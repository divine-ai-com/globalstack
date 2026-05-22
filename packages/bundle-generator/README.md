# Bundle Generator

This package owns verified-bundle and prompt-generation helpers used by:

- smoke prompt generation
- verified Azure bundle generation
- model-response smoke
- platform trial generation

These modules are invoked through stable script entrypoints under:

- `scripts/verified/*.mjs`

Dataset-visible bundle artifacts must continue to follow the Azure-only rules in `docs/product/azure-iac-principals.md`.
