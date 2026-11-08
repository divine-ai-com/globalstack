#!/usr/bin/env bash
set -euo pipefail

# Keep these release assets and digests together when updating the CodeQL bundle.
# The asset API avoids intermittent 504 responses from release download URLs.
case "${1:-}" in
  javascript)
    asset_id=692239234
    archive_sha=082e798c97831283a2a5f69e9198c51270e5767013d5333daeeab6520af9ce72
    ;;
  python)
    asset_id=692239340
    archive_sha=d862cb11aff035988f178703b69751be072f2aa7e76616f16bb725a207b50b7d
    ;;
  *) echo 'Expected javascript or python' >&2; exit 2 ;;
esac
archive_path=${2:?An output archive path is required}
archive_partial="${archive_path}.partial"
trap 'rm -f -- "$archive_partial"' EXIT
for attempt in 1 2 3; do
  if timeout 120 gh api "repos/github/codeql-action/releases/assets/$asset_id" -H 'Accept: application/octet-stream' > "$archive_partial"; then
    printf '%s  %s\n' "$archive_sha" "$archive_partial" | sha256sum --check
    mv -- "$archive_partial" "$archive_path"
    exit 0
  fi
  if [ "$attempt" -lt 3 ]; then sleep 5; fi
done
echo 'Could not download the pinned CodeQL 2.27.4 bundle' >&2
exit 1
