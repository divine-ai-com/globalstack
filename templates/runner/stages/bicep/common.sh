#!/usr/bin/env bash

set -euo pipefail

: "${TASK_DIR:=/workspace/task}"
: "${REPORT_DIR:=/workspace/reports}"
: "${WORK_DIR:=/workspace/work}"
: "${AZURE_LOCATION:=eastus}"
: "${ARM_SUBSCRIPTION_ID:=00000000-0000-0000-0000-000000000000}"
: "${ARM_TENANT_ID:=00000000-0000-0000-0000-000000000000}"
: "${ARM_CLIENT_ID:=11111111-1111-1111-1111-111111111111}"
: "${ARM_CLIENT_SECRET:=}"
: "${AZURE_ENDPOINT_URL:=http://localhost:4566}"
: "${GLOBALSTACK_TARGET_PROVIDER:=globalstack}"

export BICEP_WORK_DIR="${WORK_DIR}/bicep-task"
export BICEP_LIB_DIR="${BICEP_WORK_DIR}/lib"
export BICEP_MAIN="${BICEP_LIB_DIR}/main.bicep"
export BICEP_PARAMETERS="${BICEP_LIB_DIR}/parameters.json"
export BICEP_ARM_TEMPLATE="${REPORT_DIR}/main.azuredeploy.json"
export BICEP_DEPLOYMENT_BODY="${REPORT_DIR}/deployment-body.json"
export BICEP_DEPLOYMENT_RESPONSE="${REPORT_DIR}/deployment-response.json"
export BICEP_CLEANUP_RESPONSE="${REPORT_DIR}/cleanup-response.json"
export BICEP_LIFECYCLE_REPORT="${REPORT_DIR}/lifecycle-report.json"
export BICEP_TOKEN_RESPONSE="${REPORT_DIR}/token-response.json"

log_stage() {
  echo "[bicep:${1}] ${2}"
}

json_string() {
  jq -Rn --arg value "${1:-}" '$value'
}

write_stage_report() {
  local stage="$1"
  local status="$2"
  local message="${3:-}"
  jq -n \
    --arg stage "${stage}" \
    --arg status "${status}" \
    --arg message "${message}" \
    --arg taskDir "${TASK_DIR}" \
    --arg workDir "${BICEP_WORK_DIR}" \
    --arg reportDir "${REPORT_DIR}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    --arg deploymentResponse "${BICEP_DEPLOYMENT_RESPONSE}" \
    --arg cleanupResponse "${BICEP_CLEANUP_RESPONSE}" \
    '{
      platform: "azure-bicep",
      stage: $stage,
      status: $status,
      message: $message,
      taskDir: $taskDir,
      workDir: $workDir,
      reportDir: $reportDir,
      endpoint: $endpoint,
      artifacts: {
        deploymentResponse: $deploymentResponse,
        cleanupResponse: $cleanupResponse
      }
    }' > "${BICEP_LIFECYCLE_REPORT}"
}

copy_task_to_workdir() {
  rm -rf "${BICEP_WORK_DIR}"
  mkdir -p "${BICEP_WORK_DIR}" "${REPORT_DIR}"
  cp -R "${TASK_DIR}/." "${BICEP_WORK_DIR}/"
}

resource_group_name() {
  jq -r '.parameters.resourceGroupName.value // empty' "${BICEP_PARAMETERS}"
}

local_access_token() {
  jq -r '.access_token' "${BICEP_TOKEN_RESPONSE}"
}

is_globalstack_provider() {
  [ "${GLOBALSTACK_TARGET_PROVIDER}" = "globalstack" ]
}

request_local_token() {
  if is_globalstack_provider; then
    local body
    body="grant_type=client_credentials&client_id=${ARM_CLIENT_ID}&client_secret=${ARM_CLIENT_SECRET:-globalstack}&scope=https%3A%2F%2Fmanagement.azure.com%2F.default"
    curl -fsS \
      -X POST \
      -H 'content-type: application/x-www-form-urlencoded' \
      --data "${body}" \
      "${AZURE_ENDPOINT_URL%/}/${ARM_TENANT_ID}/oauth2/v2.0/token" > "${BICEP_TOKEN_RESPONSE}"
    return 0
  fi

  az account get-access-token \
    --resource https://management.azure.com/ \
    --subscription "${ARM_SUBSCRIPTION_ID}" \
    -o json |
    jq '{access_token: .accessToken, expires_on: .expires_on, expiresOn: .expiresOn, subscription: .subscription, tenant: .tenant, token_type: (.tokenType // "Bearer")}' \
      > "${BICEP_TOKEN_RESPONSE}"
}
