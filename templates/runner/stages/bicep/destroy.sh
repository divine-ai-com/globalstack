#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

log_stage destroy "deleting task resource group against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
token="$(local_access_token)"
resource_group="$(resource_group_name)"
cleanup_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"

status="$(
  curl -sS \
    -X DELETE \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    -o "${BICEP_CLEANUP_RESPONSE}" \
    -w '%{http_code}' \
    "${cleanup_url}"
)"

case "${status}" in
  200|202|204)
    write_stage_report destroy PASS "Resource group cleanup returned HTTP ${status}"
    ;;
  *)
    write_stage_report destroy FAIL "Resource group cleanup returned HTTP ${status}"
    exit 1
    ;;
esac
