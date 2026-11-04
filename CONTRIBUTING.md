# Contributing

GlobalStack accepts changes through pull requests into `main`. Keep each change focused and describe its effect on users or maintainers.

## Branches and commits

Use a short-lived branch named `<type>/<description>`, such as `fix/request-validation` or `docs/storage-setup`. Tool-created `codex/*` branches and automated `dependabot/*` branches are also accepted. Do not push directly to `main`.

Use Conventional Commits for commit messages and PR titles:

```text
fix(arm): reject invalid resource tags
feat(runtime): add queue delivery receipts
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, `style`.

Optional scopes: `arm`, `runtime`, `storage`, `conformance`, `runners`, `bundles`, `docs`, `deps`, `ci`, `release`.

Keep the full title at 72 characters or fewer. Start the subject with a lowercase letter and omit a final period. Mark breaking changes with `!`, for example `feat(arm)!: change resource IDs`, and explain the migration in a `Breaking changes` section.

## Pull requests

Fill in `Why`, `What changed` and `How it was tested` in the PR template. Include actual results and relevant limitations. An empty template does not satisfy the PR policy check.

Use a draft PR while work is incomplete. Request review after the required checks pass. Prefer squash merging so the PR title becomes the commit message. Delete the topic branch after merge.

Required checks:

| Check | Purpose |
|---|---|
| `CI gate` | Both supported Node.js matrix jobs passed build checks, conformance tests, repository tests and the local demo; workflow lint and dependency audit also passed |
| `PR policy` | The PR title, branch name, required sections and breaking change details follow the conventions |

The repository owner should require these checks in the `main` branch rules when that feature is available. The current private repository plan does not provide branch protection. Workflow files alone do not prevent a maintainer from bypassing checks. Configure enforcement before the public release.

## Local validation

```bash
npm ci
npm run check:local
npm run test:repository
npm run demo
git diff --check
```

The local suite skips the real Kubernetes runtime test unless Docker is explicitly requested:

```bash
npm run test:docker
```

That command can download container images and creates temporary Kubernetes containers. Verify available disk space first. Keep at least 40 GiB free in the shared development workspace. Use the targeted service E2E packs for changes to runtime behavior, and the platform matrix for changes to IaC runners. These are separate from the local CI gate.

## Support evidence

- Preserve rejection of unsupported resource types and operations.
- Verify a behavior change against documented Azure behavior, sanitized captures or a bounded official emulator integration.
- A successful local management request does not prove data-plane behavior.
- Keep capture setup failures distinct from provider validation.
- Keep model API calls and real Azure captures out of ordinary CI.
- Regenerate affected documentation with `npm run docs:nav`.
- Preserve required dependency licenses, copyright notices and attribution.

## Labels and releases

`.github/labels.json` defines the maintained label set. Preview synchronization with `node scripts/repository/sync-labels.mjs` and apply with `--apply` using a maintainer account.

Automation derives `type: feature`, `type: fix`, `type: performance`, `type: maintenance` and `breaking change` from PR titles. When a title changes, stale managed labels are removed. Contributors can add area labels to identify affected components.

Release notes use `.github/release.yml`. Before publishing a version, complete `docs/product/OPEN-SOURCE-READINESS.md`, verify the tag points to the reviewed commit, and state the supported scope and untested paths. This change does not publish a package, image or release.

## Enable public branch protection

Once the repository is public, a maintainer can apply the versioned policy:

```bash
gh api --method PUT repos/divine-ai-com/globalstack/branches/main/protection \
  --input .github/branch-protection.json
```

The policy requires passing `CI gate` and `PR policy` checks, an up-to-date branch, resolved review conversations and linear history. It also applies the checks to administrators and blocks force pushes and deletion of `main`.

The prepared policy does not require an approval while the repository has a single maintainer, since authors cannot approve their own pull requests. Require a code-owner approval once another qualified reviewer is available. Keep the owner and required-check configuration synchronized with the actual team and workflow names.

Dependency automation allows up to seven open version-update PRs: five for npm and two for GitHub Actions. Compatible updates are grouped. Security updates use a separate GitHub-managed limit. Major updates remain separate review work. Maintainers must complete the same required PR sections for automated PRs before merging; automation does not bypass the contribution checks.
