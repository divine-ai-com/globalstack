# Workspace Utils

Shared workspace path and repo-boundary helpers.

This package exists to keep path resolution and workspace discovery logic in one place instead of repeating `dirname(dirname(...))` across scripts and package-owned modules.

Default external boundaries:

- verification corpus: `../globalstack-verification/verified`
- historical conformance rerun outputs: `../globalstack-verification/conformance-history`
