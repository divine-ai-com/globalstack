# Development

## Workspace Model

GlobalStack is a single product repo with npm workspaces under `apps/*` and `packages/*`.

- root `package.json` owns the stable command surface
- `packages/` own reusable product logic
- `scripts/` are stable orchestration entrypoints grouped by domain
- `templates/` own runner and sample task source templates
- `docs/` own durable product, architecture, and runbook documentation

## Verified Workspace

Verified task bundles are treated as a separate verification workspace. The product repo keeps a compatibility path at `verified/`, but the primary storage location now lives in the sibling repo `../globalstack-verification`.

Use the sibling repo by default, or set `GLOBALSTACK_VERIFIED_ROOT` / `GLOBALSTACK_VERIFICATION_REPO_ROOT` to override it. Product code should not depend on verified bundles being first-class product source.

## Runtime Cleanup

Before or after smoke work:

```bash
npm run repo:clean-runtime:dry-run
npm run repo:clean-runtime
```

## Design Standard

- Remove duplicated path/bootstrap logic before adding more scripts.
- Prefer package-owned modules to root-level one-off helpers.
- Keep the root command surface stable, but keep implementations in domain subdirectories or packages.
