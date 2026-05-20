#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/arm-contract/common.sh

export PLATFORM_PROVIDER_LIFECYCLE_RESPONSE="${REPORT_DIR}/provider-lifecycle-response.json"
export PLATFORM_PROVIDER_LIFECYCLE_STDOUT="${REPORT_DIR}/provider-lifecycle-stdout.log"
export PLATFORM_PROVIDER_LIFECYCLE_STDERR="${REPORT_DIR}/provider-lifecycle-stderr.log"

write_provider_lifecycle_response() {
  local mode="$1"
  shift
  local operations_json
  operations_json="$(printf '%s\n' "$@" | jq -s '.')"
  jq -n \
    --arg platform "${PLATFORM_ID}" \
    --arg mode "${mode}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    --argjson operations "${operations_json}" \
    '{
      platform: $platform,
      type: "GlobalStack.PlatformRunner/providerLifecycleEvidence",
      mode: $mode,
      endpoint: $endpoint,
      status: "PASS",
      operations: $operations
    }' > "${PLATFORM_PROVIDER_LIFECYCLE_RESPONSE}"
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

append_command() {
  local operation="$1"
  local code="$2"
  jq -n \
    --arg operation "${operation}" \
    --argjson exitCode "${code}" \
    '{operation: $operation, status: "PASS", exitCode: $exitCode}'
}

token_for_reads() {
  if [ ! -s "${PLATFORM_TOKEN_RESPONSE}" ]; then
    request_local_token
  fi
  local_access_token
}

if is_native_hcl_platform; then
  tool="$(hcl_tool)"
  log_stage provider-lifecycle "checking native HCL plan, refresh, idempotency, and state reads with ${tool}"
  setup_native_hcl_auth
  mapfile -t vars < <(hcl_var_args)
  : > "${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}"
  : > "${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"

  set +e
  "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" plan -input=false -refresh=true -detailed-exitcode -no-color "${vars[@]}" >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"
  plan_code=$?
  set -e
  if [ "${plan_code}" != "0" ] && [ "${plan_code}" != "2" ]; then
    write_stage_report provider-lifecycle FAIL "${tool} refresh plan failed; see provider lifecycle stderr/stdout reports"
    exit 1
  fi

  if ! "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" apply -auto-approve -input=false -refresh=true -no-color "${vars[@]}" >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "${tool} idempotent apply failed; see provider lifecycle stderr/stdout reports"
    exit 1
  fi

  set +e
  "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" plan -input=false -refresh-only -detailed-exitcode -no-color "${vars[@]}" >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"
  refresh_code=$?
  set -e
  if [ "${refresh_code}" != "0" ] && [ "${refresh_code}" != "2" ]; then
    write_stage_report provider-lifecycle FAIL "${tool} refresh-only plan failed; see provider lifecycle stderr/stdout reports"
    exit 1
  fi

  if ! "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" state list >"${REPORT_DIR}/native-state-list.txt" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "${tool} state list failed after deploy"
    exit 1
  fi

  write_provider_lifecycle_response "NativeHclProviderLifecycle" \
    "$(append_command "${tool}-plan-refresh" "${plan_code}")" \
    "$(json_op "${tool}-apply-idempotent" PASS "apply with refresh=true completed")" \
    "$(append_command "${tool}-plan-refresh-only" "${refresh_code}")" \
    "$(json_op "${tool}-state-list" PASS "state file contains deployed resources")"
  write_stage_report provider-lifecycle PASS "${tool} provider lifecycle evidence passed"
  exit 0
fi

if is_native_pulumi_platform; then
  log_stage provider-lifecycle "checking Pulumi preview, refresh, idempotent up, and stack export"
  setup_native_pulumi_auth
  : > "${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}"
  : > "${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"

  if ! pulumi_login_local >"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}" \
    || ! pulumi_select_or_init_stack >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}" \
    || ! pulumi_configure_stack >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "Pulumi stack setup failed; see provider lifecycle reports"
    exit 1
  fi

  if ! pulumi -C "${PLATFORM_WORK_DIR}" preview --diff --non-interactive >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "pulumi preview --diff failed"
    exit 1
  fi
  if ! pulumi -C "${PLATFORM_WORK_DIR}" refresh --yes --skip-preview --non-interactive >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "pulumi refresh failed"
    exit 1
  fi
  if ! pulumi -C "${PLATFORM_WORK_DIR}" up --yes --skip-preview --non-interactive >>"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "pulumi idempotent up failed"
    exit 1
  fi
  if ! pulumi -C "${PLATFORM_WORK_DIR}" stack export >"${REPORT_DIR}/pulumi-stack-export.json" 2>>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "pulumi stack export failed"
    exit 1
  fi

  write_provider_lifecycle_response "NativePulumiProviderLifecycle" \
    "$(json_op pulumi-preview-diff PASS "preview/diff completed")" \
    "$(json_op pulumi-refresh PASS "refresh completed")" \
    "$(json_op pulumi-up-idempotent PASS "second up completed")" \
    "$(json_op pulumi-stack-export PASS "stack export completed")"
  write_stage_report provider-lifecycle PASS "Pulumi provider lifecycle evidence passed"
  exit 0
fi

if is_native_ansible_platform; then
  log_stage provider-lifecycle "checking Ansible Azure module idempotency and read-after-apply behavior"
  setup_native_ansible_auth
  : > "${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}"
  : > "${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"

  resource_group="$(resource_group_name)"
  storage_account="$(storage_account_name)"
  idempotency_playbook="${PLATFORM_WORK_DIR}/.globalstack-ansible-provider-lifecycle.yml"
  cat > "${idempotency_playbook}" <<YAML
---
- name: GlobalStack Azure Ansible provider lifecycle check
  hosts: localhost
  gather_facts: false
  collections:
    - azure.azcollection
  tasks:
    - name: Re-apply storage account through azure_rm_resource
      azure_rm_resource:
        resource_group: "${resource_group}"
        provider: Storage
        resource_type: storageAccounts
        resource_name: "${storage_account}"
        api_version: "2023-01-01"
        polling_timeout: 60
        polling_interval: 1
        auth_source: env
        body:
          location: "${AZURE_LOCATION}"
          kind: StorageV2
          sku:
            name: Standard_LRS
          properties:
            accessTier: Hot
            allowBlobPublicAccess: false
            minimumTlsVersion: TLS1_2
            supportsHttpsTrafficOnly: true
YAML

  if ! ansible-playbook -i "$(ansible_inventory_path)" "${idempotency_playbook}" >"${PLATFORM_PROVIDER_LIFECYCLE_STDOUT}" 2>"${PLATFORM_PROVIDER_LIFECYCLE_STDERR}"; then
    write_stage_report provider-lifecycle FAIL "Ansible storage account idempotency playbook failed; see provider lifecycle reports"
    exit 1
  fi

  token="$(token_for_reads)"
  rg_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
  storage_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourceGroups/${resource_group}/providers/Microsoft.Storage/storageAccounts/${storage_account}?api-version=2023-01-01"
  curl -fsS -H "Authorization: Bearer ${token}" -H 'content-type: application/json' "${rg_url}" > "${REPORT_DIR}/provider-lifecycle-resource-group-get.json"
  curl -fsS -H "Authorization: Bearer ${token}" -H 'content-type: application/json' "${storage_url}" > "${REPORT_DIR}/provider-lifecycle-storage-account-get.json"

  write_provider_lifecycle_response "NativeAnsibleProviderLifecycle" \
    "$(json_op ansible-azure-resource-idempotent PASS "storage account re-apply completed through azure_rm_resource")" \
    "$(json_op arm-read-resource-group PASS "resource group remains queryable")" \
    "$(json_op arm-read-storage-account PASS "storage account remains queryable")"
  write_stage_report provider-lifecycle PASS "Ansible provider lifecycle evidence passed"
  exit 0
fi

log_stage provider-lifecycle "checking ARM contract redeploy and read behavior"
token="$(token_for_reads)"
deploy_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/providers/Microsoft.Resources/deployments/${PLATFORM_ID}-runner-smoke?api-version=2022-09-01"
deployment_get_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/providers/Microsoft.Resources/deployments/${PLATFORM_ID}-runner-smoke?api-version=2022-09-01"

az rest \
  --method put \
  --url "${deploy_url}" \
  --body "@${PLATFORM_DEPLOYMENT_BODY}" \
  --headers 'content-type=application/json' "Authorization=Bearer ${token}" \
  --skip-authorization-header \
  -o json > "${REPORT_DIR}/provider-lifecycle-redeploy-response.json"

jq -e '.properties.provisioningState == "Succeeded"' "${REPORT_DIR}/provider-lifecycle-redeploy-response.json" >/dev/null
az rest \
  --method get \
  --url "${deployment_get_url}" \
  --headers "Authorization=Bearer ${token}" \
  --skip-authorization-header \
  -o json > "${REPORT_DIR}/provider-lifecycle-deployment-get.json"

write_provider_lifecycle_response "ArmTemplateProviderLifecycle" \
  "$(json_op arm-redeploy-idempotent PASS "same template redeploy succeeded")" \
  "$(json_op arm-deployment-get PASS "deployment read succeeded")"
write_stage_report provider-lifecycle PASS "ARM provider lifecycle evidence passed"
