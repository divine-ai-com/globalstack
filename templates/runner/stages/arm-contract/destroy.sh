#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/arm-contract/common.sh

if is_native_hcl_platform; then
  tool="$(hcl_tool)"
  log_stage destroy "destroying native HCL resources with ${tool} against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  setup_native_hcl_auth
  mapfile -t vars < <(hcl_var_args)
  if "${tool}" -chdir="${PLATFORM_WORK_DIR}/lib" destroy -auto-approve -input=false -refresh=false -no-color "${vars[@]}" >"${REPORT_DIR}/native-destroy-stdout.log" 2>"${REPORT_DIR}/native-destroy-stderr.log"; then
    write_stage_report destroy PASS "${tool} native provider destroy succeeded"
    exit 0
  fi
  write_stage_report destroy FAIL "${tool} native provider destroy failed; see native destroy stderr/stdout reports"
  exit 1
fi

if is_native_pulumi_platform; then
  log_stage destroy "destroying native Pulumi resources against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  setup_native_pulumi_auth
  if pulumi_login_local >"${REPORT_DIR}/native-destroy-stdout.log" 2>"${REPORT_DIR}/native-destroy-stderr.log" \
    && pulumi_select_or_init_stack >>"${REPORT_DIR}/native-destroy-stdout.log" 2>>"${REPORT_DIR}/native-destroy-stderr.log" \
    && pulumi -C "${PLATFORM_WORK_DIR}" destroy --yes --skip-preview --non-interactive >>"${REPORT_DIR}/native-destroy-stdout.log" 2>>"${REPORT_DIR}/native-destroy-stderr.log"; then
    write_stage_report destroy PASS "Pulumi native provider destroy succeeded"
    exit 0
  fi
  write_stage_report destroy FAIL "Pulumi native provider destroy failed; see native destroy stderr/stdout reports"
  exit 1
fi

if is_native_ansible_platform; then
  log_stage destroy "destroying native Ansible resources against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  setup_native_ansible_auth
  resource_group="$(resource_group_name)"
  destroy_playbook="${PLATFORM_WORK_DIR}/.globalstack-ansible-destroy.yml"
  cat > "${destroy_playbook}" <<YAML
---
- name: Destroy GlobalStack Azure Ansible sample
  hosts: localhost
  gather_facts: false
  collections:
    - azure.azcollection
  tasks:
    - name: Delete resource group
      azure_rm_resourcegroup:
        name: "${resource_group}"
        state: absent
        force_delete_nonempty: true
        auth_source: env
YAML
  if ansible-playbook -i "$(ansible_inventory_path)" "${destroy_playbook}" >"${REPORT_DIR}/native-destroy-stdout.log" 2>"${REPORT_DIR}/native-destroy-stderr.log"; then
    write_stage_report destroy PASS "Ansible Azure modules destroy succeeded"
    exit 0
  fi
  write_stage_report destroy FAIL "Ansible Azure modules destroy failed; see native destroy stderr/stdout reports"
  exit 1
fi

if is_native_cli_platform; then
  log_stage destroy "destroying native Azure CLI REST resources against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
  setup_native_cli_auth
  resource_group="$(resource_group_name)"
  cleanup_url="${ARM_ENDPOINT%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"
  if az rest \
    --method delete \
    --url "${cleanup_url}" \
    --headers "Authorization=Bearer ${AZURE_ACCESS_TOKEN}" \
    --skip-authorization-header \
    -o json >"${REPORT_DIR}/native-destroy-stdout.log" 2>"${REPORT_DIR}/native-destroy-stderr.log"; then
    write_stage_report destroy PASS "Azure CLI REST resource group delete succeeded"
    exit 0
  fi
  write_stage_report destroy FAIL "Azure CLI REST resource group delete failed; see native destroy stderr/stdout reports"
  exit 1
fi

log_stage destroy "deleting task resource group against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
token="$(local_access_token)"
resource_group="$(resource_group_name)"
cleanup_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${resource_group}?api-version=2021-04-01"

status="$(
  curl -sS \
    -X DELETE \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    -o "${PLATFORM_CLEANUP_RESPONSE}" \
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
