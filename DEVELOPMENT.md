# Development

## Workspace Model

GlobalStack is a single product repo with npm workspaces under `apps/*` and `packages/*`.

- root `package.json` owns the stable command surface
- `packages/` own reusable product logic
- `scripts/` are stable orchestration entrypoints grouped by domain
- `templates/` own runner and sample task source templates
- `docs/` own durable product, architecture, and runbook documentation

Each workspace package or app should own its local `build`, `test`, and `validate` scripts in its own `package.json`. The root should orchestrate those package-owned scripts through workspace commands instead of re-implementing package checks ad hoc.

## Verified Workspace

Verified task bundles are treated as a separate verification workspace. The optional corpus lives outside this source tree. Set `GLOBALSTACK_VERIFIED_ROOT` to use a verification workspace; it is not needed for the quickstart.

Use the sibling repo by default, or set `GLOBALSTACK_VERIFIED_ROOT` / `GLOBALSTACK_VERIFICATION_REPO_ROOT` to override it. Product code should not depend on verified bundles being first-class product source.

## Runtime Cleanup

Before or after smoke work:

```bash
npm run repo:clean-runtime:dry-run
npm run repo:clean-runtime
```

## Workspace Validation

Use the workspace-owned scripts when you want structural checks without the full smoke path:

```bash
npm run workspace:build
npm run workspace:test
npm run workspace:validate
```

## Design Standard

- Remove duplicated path/bootstrap logic before adding more scripts.
- Prefer package-owned modules to root-level one-off helpers.
- Keep the root command surface stable, but keep implementations in domain subdirectories or packages.
