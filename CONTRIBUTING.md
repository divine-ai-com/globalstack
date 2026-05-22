# Contributing

## Ground Rules

- Preserve fail-closed behavior. Do not add successful Azure-shaped responses for unsupported or unvalidated paths.
- Reduce duplication before adding new product code.
- Keep dataset-visible task artifacts Azure-only, except for the allowed `provider` metadata toggle.
- Treat runtime logs, reports, and workdirs as disposable artifacts, not product source.

## Required Validation

Run the smallest relevant validation set for the change, then run broader validation if you touched shared paths:

```bash
npm run docs:nav
npm run docs:test
npm run validate
git diff --check
```

For runner or bundle work, also run:

```bash
npm run repo:clean-runtime:dry-run
npm run smoke:platform-runners
```

## Change Shape

- Prefer small, composable package-owned changes over root-level script growth.
- Add a generator or helper only when it removes real duplication or clarifies ownership.
- If generated docs change, regenerate them in the same change.
