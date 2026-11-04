#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

export BICEP_PROVIDER_LIFECYCLE_RESPONSE="${REPORT_DIR}/provider-lifecycle-response.json"

write_provider_lifecycle_response() {
  local operations_json
  operations_json="$(printf '%s\n' "$@" | jq -s '.')"
  jq -n \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    --argjson operations "${operations_json}" \
    '{
      platform: "azure-bicep",
      type: "GlobalStack.PlatformRunner/providerLifecycleEvidence",
      mode: "BicepProviderLifecycle",
      endpoint: $endpoint,
      status: "PASS",
      operations: $operations
    }' > "${BICEP_PROVIDER_LIFECYCLE_RESPONSE}"
}

json_op() {
  local operation="$1"
  local status="$2"
  local detail="${3:-}"
  jq -n \
    --arg operation "${operation}" \
    --arg status "${status}" \
    --arg detail "${detail}" \
    '{operation: $operation, status: $status, detail: $detail}'
}

log_stage provider-lifecycle "checking Bicep redeploy, deployment read, and resource read behavior"
if [ ! -s "${BICEP_TOKEN_RESPONSE}" ]; then
  request_local_token
fi
token="$(local_access_token)"

deploy_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/providers/Microsoft.Resources/deployments/bicep-runner-smoke?api-version=2022-09-01"
az rest \
  --method put \
  --url "${deploy_url}" \
  --body "@${BICEP_DEPLOYMENT_BODY}" \
  --headers 'content-type=application/json' "Authorization=Bearer ${token}" \
  --skip-authorization-header \
  -o json > "${REPORT_DIR}/provider-lifecycle-redeploy-response.json"

jq -e '.properties.provisioningState == "Succeeded"' "${REPORT_DIR}/provider-lifecycle-redeploy-response.json" >/dev/null

az rest \
  --method get \
  --url "${deploy_url}" \
  --headers "Authorization=Bearer ${token}" \
  --skip-authorization-header \
  -o json > "${REPORT_DIR}/provider-lifecycle-deployment-get.json"

resource_group="$(resource_group_name)"
rg_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
curl -fsS \
  -H "Authorization: Bearer ${token}" \
  -H 'content-type: application/json' \
  "${rg_url}" > "${REPORT_DIR}/provider-lifecycle-resource-group-get.json"

write_provider_lifecycle_response \
  "$(json_op bicep-redeploy-idempotent PASS "same compiled template redeploy succeeded")" \
  "$(json_op arm-deployment-get PASS "deployment read succeeded")" \
  "$(json_op arm-read-resource-group PASS "resource group remains queryable")"
write_stage_report provider-lifecycle PASS "Bicep provider lifecycle evidence passed"
