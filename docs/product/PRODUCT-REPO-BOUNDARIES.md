# Product Repo Boundaries

This repo is the GlobalStack product source tree. It should contain product code, tests, templates, fixtures, and durable docs. It should not accumulate per-run runtime noise.

Verified task bundles are treated as a separate verification workspace. The product repo keeps a compatibility path at `verified/`, but the actual corpus now lives in the sibling repo `../globalstack-verification`.

## Keep In Git

- product source under `apps/`, `packages/`, `scripts/`, `templates/`, and `extensions/`
- durable docs under `docs/`
- sanitized capture fixtures under `fixtures/`

## Do Not Keep In Git

- runner execution logs
- generated execution reports
- flattened runtime outputs
- ephemeral platform runtime state under generated `dist/platform-images/*/{reports,work,volume}`

Those artifacts are useful while executing or debugging a task, but they are not durable product source.

## Verified Workspace Boundary

- keep verified bundles addressable through `verified/`
- store the actual verified corpus outside the core product tree in `../globalstack-verification`, or point `GLOBALSTACK_VERIFIED_ROOT` / `GLOBALSTACK_VERIFICATION_REPO_ROOT` at another location
- do not let runtime reports, logs, or flattened outputs become durable product assets

## Cleanup

Dry-run cleanup:

```bash
npm run repo:clean-runtime:dry-run
```

Actual cleanup:

```bash
npm run repo:clean-runtime
```

The cleanup script removes only known runtime artifacts:

- `verified/**/execution.log`
- `verified/**/execution-report.json`
- `verified/**/execution_report.json`
- `verified/**/flat-outputs.json`
- `dist/platform-images/*/reports`
- `dist/platform-images/*/work`
- `dist/platform-images/*/volume`

It does not delete source files, fixtures, templates, or durable docs.
