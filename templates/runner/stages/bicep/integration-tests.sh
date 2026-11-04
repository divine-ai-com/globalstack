#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

log_stage integration-tests "verifying deployed resource group and outputs"
token="$(local_access_token)"
resource_group="$(resource_group_name)"

rg_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
curl -fsS \
  -H "Authorization: Bearer ${token}" \
  -H 'content-type: application/json' \
  "${rg_url}" > "${REPORT_DIR}/resource-group-get.json"

jq -e --arg name "${resource_group}" '.name == $name' "${REPORT_DIR}/resource-group-get.json" >/dev/null
jq -e '.properties.outputs | type == "object"' "${BICEP_DEPLOYMENT_RESPONSE}" >/dev/null
jq '.properties.outputs' "${BICEP_DEPLOYMENT_RESPONSE}" > "${BICEP_NATIVE_OUTPUTS}"
run_task_stage_command integration-tests
write_stage_report integration-tests PASS "Bicep deployment is queryable through Azure-shaped ARM reads"
