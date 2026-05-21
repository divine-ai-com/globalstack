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
export BICEP_NATIVE_OUTPUTS="${REPORT_DIR}/native-outputs.json"
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
  local report_path="${REPORT_DIR}/stage-${stage}.json"
  local report_json
  report_json="$(
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
    }'
  )"
  printf '%s\n' "${report_json}" > "${BICEP_LIFECYCLE_REPORT}"
  printf '%s\n' "${report_json}" > "${report_path}"
}

copy_task_to_workdir() {
  rm -rf "${BICEP_WORK_DIR}"
  mkdir -p "${BICEP_WORK_DIR}" "${REPORT_DIR}"
  cp -R "${TASK_DIR}/." "${BICEP_WORK_DIR}/"
}

task_metadata_path() {
  printf '%s\n' "${BICEP_WORK_DIR}/metadata.json"
}

task_stage_command() {
  local stage="$1"
  local metadata
  metadata="$(task_metadata_path)"
  if [ ! -f "${metadata}" ]; then
    return 0
  fi
  jq -r --arg stage "${stage}" '.stageCommands[$stage] // .tests[$stage] // empty' "${metadata}" 2>/dev/null || true
}

run_task_stage_command() {
  local stage="$1"
  local command
  command="$(task_stage_command "${stage}")"
  if [ -z "${command}" ] || [ "${command}" = "null" ]; then
    return 0
  fi

  log_stage "${stage}" "running task-defined ${stage} command"
  export GLOBALSTACK_TASK_DIR="${TASK_DIR}"
  export GLOBALSTACK_WORK_DIR="${BICEP_WORK_DIR}"
  export GLOBALSTACK_REPORT_DIR="${REPORT_DIR}"
  export GLOBALSTACK_PLATFORM_ID="azure-bicep"
  export GLOBALSTACK_TEST_STAGE="${stage}"
  export GLOBALSTACK_TOKEN_RESPONSE_PATH="${BICEP_TOKEN_RESPONSE}"
  export GLOBALSTACK_DEPLOYMENT_RESPONSE_PATH="${BICEP_DEPLOYMENT_RESPONSE}"
  export GLOBALSTACK_PROVIDER_LIFECYCLE_RESPONSE_PATH="${REPORT_DIR}/provider-lifecycle-response.json"
  export GLOBALSTACK_NATIVE_OUTPUTS_PATH="${BICEP_NATIVE_OUTPUTS}"
  export GLOBALSTACK_ENDPOINT_URL="${AZURE_ENDPOINT_URL}"
  export AZURE_RESOURCE_MANAGER_ENDPOINT="${AZURE_ENDPOINT_URL}"
  export ARM_ENDPOINT="${AZURE_ENDPOINT_URL}"
  export AZURE_ACCESS_TOKEN_PATH="${BICEP_TOKEN_RESPONSE}"
  export AZURE_DEPLOYMENT_OUTPUTS_PATH="${BICEP_NATIVE_OUTPUTS}"
  export AZURE_DEPLOYMENT_RESPONSE_PATH="${BICEP_DEPLOYMENT_RESPONSE}"
  export AZURE_STORAGE_BLOB_ENDPOINT="${AZURE_STORAGE_BLOB_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_BLOB_PORT:-10000}}"
  export AZURE_STORAGE_QUEUE_ENDPOINT="${AZURE_STORAGE_QUEUE_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_QUEUE_PORT:-10001}}"
  export AZURE_STORAGE_TABLE_ENDPOINT="${AZURE_STORAGE_TABLE_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_TABLE_PORT:-10002}}"
  export AZURE_STORAGE_ACCOUNT_KEY="${AZURE_STORAGE_ACCOUNT_KEY:-${GLOBALSTACK_AZURE_STORAGE_ACCOUNT_KEY:-Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==}}"
  export AZURE_EVENT_GRID_PUBLISH_ENDPOINT="${AZURE_EVENT_GRID_PUBLISH_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_EVENT_GRID_PORT:-6010}}"
  export AZURE_APP_CONFIGURATION_ENDPOINT="${AZURE_APP_CONFIGURATION_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_APP_CONFIGURATION_PORT:-8483}}"

  if ! GLOBALSTACK_STAGE_COMMAND="${command}" /bin/bash -lc 'cd "${GLOBALSTACK_WORK_DIR}" && eval "${GLOBALSTACK_STAGE_COMMAND}"' \
    > "${REPORT_DIR}/${stage}-task-stdout.log" 2> "${REPORT_DIR}/${stage}-task-stderr.log"; then
    write_stage_report "${stage}" FAIL "task-defined ${stage} command failed; see ${stage}-task-stderr.log"
    return 1
  fi
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
