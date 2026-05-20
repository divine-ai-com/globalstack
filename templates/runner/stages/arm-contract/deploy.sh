#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/arm-contract/common.sh

if is_native_hcl_platform; then
  tool="$(hcl_tool)"
  log_stage deploy "deploying native HCL with ${tool} against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  request_local_token
  token="$(local_access_token)"
  if [ -z "${token}" ] || [ "${token}" = "null" ]; then
    write_stage_report deploy FAIL "local Azure token request did not return an access_token"
    exit 1
  fi
  setup_native_hcl_auth
  mapfile -t vars < <(hcl_var_args)
  if ! "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" init -input=false >"${PLATFORM_NATIVE_STDOUT}" 2>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "${tool} init failed; see native stderr/stdout reports"
    exit 1
  fi
  if ! "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" apply -auto-approve -input=false -refresh=false -no-color "${vars[@]}" >>"${PLATFORM_NATIVE_STDOUT}" 2>>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "${tool} apply failed; see native stderr/stdout reports"
    exit 1
  fi
  if ! "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" output -json > "${PLATFORM_NATIVE_OUTPUTS}" 2>>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "${tool} output -json failed; see native stderr/stdout reports"
    exit 1
  fi
  resource_group="$(resource_group_name)"
  storage_account="$(storage_account_name)"
  rg_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
  curl -fsS \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    "${rg_url}" > "${REPORT_DIR}/resource-group-get.json"
  jq -e --arg name "${resource_group}" '.name == $name' "${REPORT_DIR}/resource-group-get.json" >/dev/null
  write_native_hcl_deployment_response "${tool}" "${resource_group}" "${storage_account}"
  write_stage_report deploy PASS "${tool} native provider apply succeeded"
  exit 0
fi

if is_native_pulumi_platform; then
  log_stage deploy "deploying native Pulumi program against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  request_local_token
  token="$(local_access_token)"
  if [ -z "${token}" ] || [ "${token}" = "null" ]; then
    write_stage_report deploy FAIL "local Azure token request did not return an access_token"
    exit 1
  fi
  if [ "${PLATFORM_ID}" = "azure-pulumi-yaml" ]; then
    setup_native_pulumi_auth
  fi
  if ! pulumi_install_dependencies; then
    write_stage_report deploy FAIL "Pulumi dependency installation failed; see pulumi install stderr/stdout reports"
    exit 1
  fi
  if [ "${PLATFORM_ID}" != "azure-pulumi-yaml" ]; then
    setup_native_pulumi_auth
  fi
  if ! pulumi_login_local >"${PLATFORM_NATIVE_STDOUT}" 2>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "pulumi login failed; see native stderr/stdout reports"
    exit 1
  fi
  if ! pulumi_select_or_init_stack >>"${PLATFORM_NATIVE_STDOUT}" 2>>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "pulumi stack init/select failed; see native stderr/stdout reports"
    exit 1
  fi
  if ! pulumi_configure_stack >>"${PLATFORM_NATIVE_STDOUT}" 2>>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "pulumi config failed; see native stderr/stdout reports"
    exit 1
  fi
  if ! pulumi -C "${PLATFORM_WORK_DIR}" up --yes --skip-preview --non-interactive >>"${PLATFORM_NATIVE_STDOUT}" 2>>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "pulumi up failed; see native stderr/stdout reports"
    exit 1
  fi
  resource_group="$(resource_group_name)"
  storage_account="$(storage_account_name)"
  rg_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
  curl -fsS \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    "${rg_url}" > "${REPORT_DIR}/resource-group-get.json"
  jq -e --arg name "${resource_group}" '.name == $name' "${REPORT_DIR}/resource-group-get.json" >/dev/null
  pulumi -C "${PLATFORM_WORK_DIR}" stack output --json > "${REPORT_DIR}/pulumi-outputs.json"
  cp "${REPORT_DIR}/pulumi-outputs.json" "${PLATFORM_NATIVE_OUTPUTS}"
  write_native_pulumi_deployment_response "${resource_group}" "${storage_account}"
  write_stage_report deploy PASS "Pulumi native provider up succeeded"
  exit 0
fi

if is_native_ansible_platform; then
  log_stage deploy "deploying native Ansible Azure modules against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  request_local_token
  token="$(local_access_token)"
  if [ -z "${token}" ] || [ "${token}" = "null" ]; then
    write_stage_report deploy FAIL "local Azure token request did not return an access_token"
    exit 1
  fi
  setup_native_ansible_auth
  if ! ansible-playbook -i "$(ansible_inventory_path)" "$(ansible_playbook_path)" >"${PLATFORM_NATIVE_STDOUT}" 2>"${PLATFORM_NATIVE_STDERR}"; then
    write_stage_report deploy FAIL "ansible-playbook failed; see native stderr/stdout reports"
    exit 1
  fi
  resource_group="$(resource_group_name)"
  storage_account="$(storage_account_name)"
  rg_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
  storage_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourceGroups/${resource_group}/providers/Microsoft.Storage/storageAccounts/${storage_account}?api-version=2023-01-01"
  curl -fsS \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    "${rg_url}" > "${REPORT_DIR}/resource-group-get.json"
  jq -e --arg name "${resource_group}" '.name == $name' "${REPORT_DIR}/resource-group-get.json" >/dev/null
  curl -fsS \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    "${storage_url}" > "${REPORT_DIR}/storage-account-get.json"
  jq -e --arg name "${storage_account}" '.name == $name' "${REPORT_DIR}/storage-account-get.json" >/dev/null
  write_native_ansible_deployment_response "${resource_group}" "${storage_account}"
  write_stage_report deploy PASS "Ansible Azure modules completed successfully"
  exit 0
fi

log_stage deploy "deploying ARM contract against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
request_local_token
token="$(local_access_token)"
if [ -z "${token}" ] || [ "${token}" = "null" ]; then
  write_stage_report deploy FAIL "local Azure token request did not return an access_token"
  exit 1
fi

jq -n \
  --slurpfile template "${PLATFORM_TEMPLATE}" \
  --slurpfile parameters "${PLATFORM_PARAMETERS}" \
  --arg location "${AZURE_LOCATION}" \
  '{
    location: $location,
    properties: {
      mode: "Incremental",
      template: $template[0],
      parameters: $parameters[0].parameters
    }
  }' > "${PLATFORM_DEPLOYMENT_BODY}"

deploy_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/providers/Microsoft.Resources/deployments/${PLATFORM_ID}-runner-smoke?api-version=2022-09-01"
az rest \
  --method put \
  --url "${deploy_url}" \
  --body "@${PLATFORM_DEPLOYMENT_BODY}" \
  --headers 'content-type=application/json' "Authorization=Bearer ${token}" \
  --skip-authorization-header \
  -o json > "${PLATFORM_DEPLOYMENT_RESPONSE}"

jq -e '.properties.provisioningState == "Succeeded"' "${PLATFORM_DEPLOYMENT_RESPONSE}" >/dev/null
jq -e '(.properties.globalstackDeploymentSteps | length) > 0' "${PLATFORM_DEPLOYMENT_RESPONSE}" >/dev/null
write_stage_report deploy PASS "ARM contract deployment succeeded"
