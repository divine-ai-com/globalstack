#!/usr/bin/env bash

set -euo pipefail

: "${TASK_DIR:=/workspace/task}"
: "${REPORT_DIR:=/workspace/reports}"
: "${WORK_DIR:=/workspace/work}"
: "${PLATFORM_ID:=unknown}"
: "${TOOLCHAIN:=unknown}"
: "${AZURE_LOCATION:=eastus}"
: "${ARM_SUBSCRIPTION_ID:=00000000-0000-0000-0000-000000000000}"
: "${ARM_TENANT_ID:=00000000-0000-0000-0000-000000000000}"
: "${ARM_CLIENT_ID:=11111111-1111-1111-1111-111111111111}"
: "${ARM_CLIENT_SECRET:=}"
: "${AZURE_ENDPOINT_URL:=http://localhost:4566}"
: "${GLOBALSTACK_TARGET_PROVIDER:=globalstack}"

export PLATFORM_WORK_DIR="${WORK_DIR}/${PLATFORM_ID}"
if [ "${PLATFORM_ID}" = "azure-arm-json" ]; then
  export PLATFORM_CONTRACT_DIR="${PLATFORM_WORK_DIR}/lib"
else
  export PLATFORM_CONTRACT_DIR="${PLATFORM_WORK_DIR}/globalstack"
fi
export PLATFORM_TEMPLATE="${PLATFORM_CONTRACT_DIR}/azuredeploy.json"
export PLATFORM_PARAMETERS="${PLATFORM_CONTRACT_DIR}/azuredeploy.parameters.json"
export PLATFORM_DEPLOYMENT_BODY="${REPORT_DIR}/deployment-body.json"
export PLATFORM_DEPLOYMENT_RESPONSE="${REPORT_DIR}/deployment-response.json"
export PLATFORM_NATIVE_OUTPUTS="${REPORT_DIR}/native-outputs.json"
export PLATFORM_CLEANUP_RESPONSE="${REPORT_DIR}/cleanup-response.json"
export PLATFORM_LIFECYCLE_REPORT="${REPORT_DIR}/lifecycle-report.json"
export PLATFORM_TOKEN_RESPONSE="${REPORT_DIR}/token-response.json"
export PLATFORM_NATIVE_STDOUT="${REPORT_DIR}/native-stdout.log"
export PLATFORM_NATIVE_STDERR="${REPORT_DIR}/native-stderr.log"
export PLATFORM_NATIVE_PROXY_DIR="${PLATFORM_WORK_DIR}/.globalstack-https-proxy"
export PLATFORM_NATIVE_PROXY_PORT="${GLOBALSTACK_NATIVE_HCL_HTTPS_PORT:-4567}"
export PLATFORM_TRANSPARENT_PROXY_DIR="${PLATFORM_WORK_DIR}/.globalstack-transparent-proxy"
export PLATFORM_TRANSPARENT_PROXY_PORT="${GLOBALSTACK_TRANSPARENT_HTTPS_PORT:-443}"

log_stage() {
  echo "[${PLATFORM_ID}:${1}] ${2}"
}

write_stage_report() {
  local stage="$1"
  local status="$2"
  local message="${3:-}"
  local report_path="${REPORT_DIR}/stage-${stage}.json"
  local report_json
  report_json="$(
    jq -n \
    --arg platform "${PLATFORM_ID}" \
    --arg stage "${stage}" \
    --arg status "${status}" \
    --arg message "${message}" \
    --arg taskDir "${TASK_DIR}" \
    --arg workDir "${PLATFORM_WORK_DIR}" \
    --arg reportDir "${REPORT_DIR}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    '{
      platform: $platform,
      stage: $stage,
      status: $status,
      message: $message,
      taskDir: $taskDir,
      workDir: $workDir,
      reportDir: $reportDir,
      endpoint: $endpoint
    }'
  )"
  printf '%s\n' "${report_json}" > "${PLATFORM_LIFECYCLE_REPORT}"
  printf '%s\n' "${report_json}" > "${report_path}"
}

copy_task_to_workdir() {
  rm -rf "${PLATFORM_WORK_DIR}"
  mkdir -p "${PLATFORM_WORK_DIR}" "${REPORT_DIR}"
  cp -R "${TASK_DIR}/." "${PLATFORM_WORK_DIR}/"
}

task_metadata_path() {
  printf '%s\n' "${PLATFORM_WORK_DIR}/metadata.json"
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
  export GLOBALSTACK_WORK_DIR="${PLATFORM_WORK_DIR}"
  export GLOBALSTACK_REPORT_DIR="${REPORT_DIR}"
  export GLOBALSTACK_PLATFORM_ID="${PLATFORM_ID}"
  export GLOBALSTACK_TEST_STAGE="${stage}"
  export GLOBALSTACK_TOKEN_RESPONSE_PATH="${PLATFORM_TOKEN_RESPONSE}"
  export GLOBALSTACK_DEPLOYMENT_RESPONSE_PATH="${PLATFORM_DEPLOYMENT_RESPONSE}"
  export GLOBALSTACK_PROVIDER_LIFECYCLE_RESPONSE_PATH="${REPORT_DIR}/provider-lifecycle-response.json"
  export GLOBALSTACK_NATIVE_OUTPUTS_PATH="${PLATFORM_NATIVE_OUTPUTS}"
  export GLOBALSTACK_ENDPOINT_URL="${AZURE_ENDPOINT_URL}"
  export AZURE_RESOURCE_MANAGER_ENDPOINT="${AZURE_ENDPOINT_URL}"
  export ARM_ENDPOINT="${AZURE_ENDPOINT_URL}"
  export AZURE_ACCESS_TOKEN_PATH="${PLATFORM_TOKEN_RESPONSE}"
  export AZURE_DEPLOYMENT_OUTPUTS_PATH="${PLATFORM_NATIVE_OUTPUTS}"
  export AZURE_DEPLOYMENT_RESPONSE_PATH="${PLATFORM_DEPLOYMENT_RESPONSE}"
  export AZURE_STORAGE_BLOB_ENDPOINT="${AZURE_STORAGE_BLOB_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_BLOB_PORT:-10000}}"
  export AZURE_STORAGE_QUEUE_ENDPOINT="${AZURE_STORAGE_QUEUE_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_QUEUE_PORT:-10001}}"
  export AZURE_STORAGE_TABLE_ENDPOINT="${AZURE_STORAGE_TABLE_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_TABLE_PORT:-10002}}"
  export AZURE_STORAGE_ACCOUNT_KEY="${AZURE_STORAGE_ACCOUNT_KEY:-${GLOBALSTACK_AZURE_STORAGE_ACCOUNT_KEY:-Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==}}"
  export AZURE_EVENT_GRID_PUBLISH_ENDPOINT="${AZURE_EVENT_GRID_PUBLISH_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_EVENT_GRID_PORT:-6010}}"
  export AZURE_APP_CONFIGURATION_ENDPOINT="${AZURE_APP_CONFIGURATION_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_APP_CONFIGURATION_PORT:-8483}}"
  export AZURE_FUNCTIONS_ENDPOINT="${AZURE_FUNCTIONS_ENDPOINT:-http://127.0.0.1:${GLOBALSTACK_FUNCTIONS_PORT:-7071}}"

  if ! GLOBALSTACK_STAGE_COMMAND="${command}" /bin/bash -lc 'cd "${GLOBALSTACK_WORK_DIR}" && eval "${GLOBALSTACK_STAGE_COMMAND}"' \
    > "${REPORT_DIR}/${stage}-task-stdout.log" 2> "${REPORT_DIR}/${stage}-task-stderr.log"; then
    write_stage_report "${stage}" FAIL "task-defined ${stage} command failed; see ${stage}-task-stderr.log"
    return 1
  fi
}

resource_group_name() {
  jq -r '.parameters.resourceGroupName.value // empty' "${PLATFORM_PARAMETERS}"
}

storage_account_name() {
  jq -r '.parameters.storageAccountName.value // empty' "${PLATFORM_PARAMETERS}"
}

storage_account_host_aliases() {
  {
    storage_account_name
    if [ -f "$(task_metadata_path)" ]; then
      jq -r '
        .integrationChecks[]?
        | select(.provider == "Microsoft.Storage")
        | .typePath
        | capture("^storageAccounts/(?<account>[^/]+)").account
      ' "$(task_metadata_path)" 2>/dev/null || true
    fi
  } | awk 'NF { print tolower($0) }' | awk '!seen[$0]++'
}

key_vault_host_aliases() {
  {
    if [ -f "$(task_metadata_path)" ]; then
      jq -r '
        [
          (.resourceNames.keyVault // empty),
          (.integrationChecks[]?
            | select(.provider == "Microsoft.KeyVault")
            | .typePath
            | capture("^vaults/(?<vault>[^/]+)").vault)
        ] | .[]
      ' "$(task_metadata_path)" 2>/dev/null || true
    fi
  } | awk 'NF { print tolower($0) }' | awk '!seen[$0]++'
}

edge_host_aliases() {
  if [ ! -f "$(task_metadata_path)" ]; then
    return 0
  fi

  jq -r '
    .integrationChecks[]?
    | select(.provider == "Microsoft.Cdn")
    | .typePath
    | if test("^profiles/[^/]+/afdEndpoints/[^/]+$") then
        capture("^profiles/[^/]+/afdEndpoints/(?<endpoint>[^/]+)$").endpoint + ".azurefd.net"
      elif test("^profiles/[^/]+/endpoints/[^/]+$") then
        capture("^profiles/[^/]+/endpoints/(?<endpoint>[^/]+)$").endpoint + ".azureedge.net"
      else
        empty
      end
  ' "$(task_metadata_path)" 2>/dev/null | awk 'NF { print tolower($0) }' | awk '!seen[$0]++'
}

local_access_token() {
  jq -r '.access_token' "${PLATFORM_TOKEN_RESPONSE}"
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
      "${AZURE_ENDPOINT_URL%/}/${ARM_TENANT_ID}/oauth2/v2.0/token" > "${PLATFORM_TOKEN_RESPONSE}"
    return 0
  fi

  az account get-access-token \
    --resource https://management.azure.com/ \
    --subscription "${ARM_SUBSCRIPTION_ID}" \
    -o json |
    jq '{access_token: .accessToken, expires_on: .expires_on, expiresOn: .expiresOn, subscription: .subscription, tenant: .tenant, token_type: (.tokenType // "Bearer")}' \
      > "${PLATFORM_TOKEN_RESPONSE}"
}

native_check() {
  case "${PLATFORM_ID}" in
    azure-arm-json)
      jq -e '.resources | arrays | length > 0' "${PLATFORM_WORK_DIR}/lib/azuredeploy.json" >/dev/null
      jq -e '.parameters.resourceGroupName.value | strings | length > 0' "${PLATFORM_WORK_DIR}/lib/azuredeploy.parameters.json" >/dev/null
      ;;
    azure-terraform-hcl)
      terraform -chdir="${PLATFORM_WORK_DIR}/lib" fmt -check -recursive
      terraform -chdir="${PLATFORM_WORK_DIR}/lib" init -backend=false -input=false
      terraform -chdir="${PLATFORM_WORK_DIR}/lib" validate -no-color
      ;;
    azure-opentofu-hcl)
      tofu -chdir="${PLATFORM_WORK_DIR}/lib" fmt -check -recursive
      tofu -chdir="${PLATFORM_WORK_DIR}/lib" init -backend=false -input=false
      tofu -chdir="${PLATFORM_WORK_DIR}/lib" validate -no-color
      ;;
    azure-pulumi-ts)
      test -f "${PLATFORM_WORK_DIR}/bin/tap.ts"
      test -f "${PLATFORM_WORK_DIR}/lib/tap-stack.ts"
      grep -q 'createTapStack' "${PLATFORM_WORK_DIR}/bin/tap.ts"
      grep -q '@pulumi/azure-native' "${PLATFORM_WORK_DIR}/lib/tap-stack.ts"
      jq -e '.dependencies["@pulumi/azure-native"]' "${PLATFORM_WORK_DIR}/package.json" >/dev/null
      ;;
    azure-pulumi-py)
      python3 -m py_compile "${PLATFORM_WORK_DIR}/tap.py" "${PLATFORM_WORK_DIR}/lib/tap_stack.py"
      ;;
    azure-pulumi-yaml)
      python3 - <<'PY' "${PLATFORM_WORK_DIR}/Pulumi.yaml"
import sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
required = ["runtime: yaml", "azure-native:", "resources:", "outputs:"]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f"Pulumi YAML missing required sections: {missing}")
PY
      ;;
    azure-ansible-yaml)
      ansible-playbook -i "${PLATFORM_WORK_DIR}/inventory.yml" "${PLATFORM_WORK_DIR}/lib/playbook.yml" --syntax-check
      ;;
    azure-cli-rest)
      test -f "${PLATFORM_WORK_DIR}/lib/deploy.sh"
      bash -n "${PLATFORM_WORK_DIR}/lib/deploy.sh"
      grep -q 'az rest' "${PLATFORM_WORK_DIR}/lib/deploy.sh"
      grep -q 'ARM_SUBSCRIPTION_ID' "${PLATFORM_WORK_DIR}/lib/deploy.sh"
      grep -q 'ARM_ENDPOINT' "${PLATFORM_WORK_DIR}/lib/deploy.sh"
      ;;
    *)
      echo "No native check registered for ${PLATFORM_ID}" >&2
      return 1
      ;;
  esac
}

is_native_hcl_platform() {
  case "${PLATFORM_ID}" in
    azure-terraform-hcl|azure-opentofu-hcl) return 0 ;;
    *) return 1 ;;
  esac
}

is_native_pulumi_platform() {
  case "${PLATFORM_ID}" in
    azure-pulumi-ts|azure-pulumi-py|azure-pulumi-yaml) return 0 ;;
    *) return 1 ;;
  esac
}

is_native_ansible_platform() {
  case "${PLATFORM_ID}" in
    azure-ansible-yaml) return 0 ;;
    *) return 1 ;;
  esac
}

is_native_cli_platform() {
  case "${PLATFORM_ID}" in
    azure-cli-rest) return 0 ;;
    *) return 1 ;;
  esac
}

hcl_tool() {
  case "${PLATFORM_ID}" in
    azure-terraform-hcl) printf '%s\n' terraform ;;
    azure-opentofu-hcl) printf '%s\n' tofu ;;
    *) return 1 ;;
  esac
}

setup_native_hcl_auth() {
  if ! is_globalstack_provider; then
    export ARM_SUBSCRIPTION_ID
    export ARM_RESOURCE_MANAGER_ENDPOINT="${AZURE_ENDPOINT_URL%/}/"
    export ARM_ENDPOINT="${AZURE_ENDPOINT_URL%/}"
    export TF_IN_AUTOMATION=1
    if [ -z "${ARM_CLIENT_SECRET:-}" ]; then
      export ARM_USE_CLI=true
    fi
    return 0
  fi

  setup_native_hcl_https_proxy
  local shim_dir="${PLATFORM_WORK_DIR}/.globalstack-bin"
  mkdir -p "${shim_dir}"
  cat > "${shim_dir}/az" <<SH
#!/usr/bin/env bash
if [ "\$1" = "account" ] && [ "\$2" = "get-access-token" ]; then
  cat <<JSON
{"accessToken":"${localIdentityAccessToken:-globalstack-local-token}","expiresOn":"2099-01-01 00:00:00.000000","expires_on":4070908800,"subscription":"${ARM_SUBSCRIPTION_ID}","tenant":"${ARM_TENANT_ID}","tokenType":"Bearer"}
JSON
  exit 0
fi
if [ "\$1" = "account" ] && [ "\$2" = "show" ]; then
  cat <<JSON
{"id":"${ARM_SUBSCRIPTION_ID}","tenantId":"${ARM_TENANT_ID}","name":"GlobalStack Local Subscription","state":"Enabled","environmentName":"AzureCloud","user":{"type":"user","name":"globalstack-local-user@example.invalid"}}
JSON
  exit 0
fi
if [ "\$1" = "cloud" ] && [ "\$2" = "show" ]; then
  cat <<JSON
{"name":"AzureCloud","profile":"latest","endpoints":{"resourceManager":"https://localhost:${PLATFORM_NATIVE_PROXY_PORT}/","activeDirectory":"https://localhost:${PLATFORM_NATIVE_PROXY_PORT}/","activeDirectoryResourceId":"https://localhost:${PLATFORM_NATIVE_PROXY_PORT}/","gallery":"https://localhost:${PLATFORM_NATIVE_PROXY_PORT}/"},"suffixes":{"storageEndpoint":"core.windows.net","keyvaultDns":"vault.azure.net"}}
JSON
  exit 0
fi
if [ "\$1" = "version" ]; then
  echo '{"azure-cli":"2.99.0"}'
  exit 0
fi
echo "globalstack az shim: unsupported \$*" >&2
exit 1
SH
  chmod +x "${shim_dir}/az"

  export PATH="${shim_dir}:${PATH}"
  export ARM_USE_CLI=true
  export ARM_SUBSCRIPTION_ID
  export ARM_TENANT_ID
  export ARM_CLIENT_ID
  unset ARM_CLIENT_SECRET
  export ARM_RESOURCE_MANAGER_ENDPOINT="https://localhost:${PLATFORM_NATIVE_PROXY_PORT}/"
  export ARM_ENDPOINT="https://localhost:${PLATFORM_NATIVE_PROXY_PORT}"
  export SSL_CERT_FILE="${PLATFORM_NATIVE_PROXY_DIR}/globalstack.crt"
  export REQUESTS_CA_BUNDLE="${PLATFORM_NATIVE_PROXY_DIR}/globalstack.crt"
  export AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY=true
  export TF_IN_AUTOMATION=1
}

setup_native_pulumi_auth() {
  if is_globalstack_provider; then
    setup_pulumi_transparent_globalstack_proxy
    export ARM_SUBSCRIPTION_ID
    export ARM_TENANT_ID
    export ARM_CLIENT_ID
    export ARM_CLIENT_SECRET="${ARM_CLIENT_SECRET:-globalstack}"
    unset ARM_USE_CLI
    unset ARM_METADATA_HOSTNAME
    unset ARM_ENVIRONMENT
    unset ARM_RESOURCE_MANAGER_ENDPOINT
    unset ARM_ENDPOINT
    export SSL_CERT_FILE="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
    export REQUESTS_CA_BUNDLE="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
    export NODE_EXTRA_CA_CERTS="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
    export AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY=true
  else
    setup_native_hcl_auth
  fi
  export PULUMI_CONFIG_PASSPHRASE="${PULUMI_CONFIG_PASSPHRASE:-}"
  export PULUMI_SKIP_UPDATE_CHECK=true
  export PULUMI_HOME="${PLATFORM_WORK_DIR}/.pulumi-home"
  export GLOBALSTACK_RESOURCE_GROUP_NAME="$(resource_group_name)"
  export GLOBALSTACK_STORAGE_ACCOUNT_NAME="$(storage_account_name)"
  mkdir -p "${PULUMI_HOME}" "${PLATFORM_WORK_DIR}/.pulumi-state"
}

setup_native_ansible_auth() {
  export ARM_SUBSCRIPTION_ID
  export ARM_TENANT_ID
  export ARM_CLIENT_ID
  export ARM_CLIENT_SECRET="${ARM_CLIENT_SECRET:-globalstack}"
  export AZURE_SUBSCRIPTION_ID="${ARM_SUBSCRIPTION_ID}"
  export AZURE_TENANT="${ARM_TENANT_ID}"
  export AZURE_CLIENT_ID="${ARM_CLIENT_ID}"
  export AZURE_SECRET="${ARM_CLIENT_SECRET}"
  export ANSIBLE_AZURE_AUTH_SOURCE=env
  export AZURE_DISABLE_INSTANCE_DISCOVERY=true
  export GLOBALSTACK_RESOURCE_GROUP_NAME="$(resource_group_name)"
  export GLOBALSTACK_STORAGE_ACCOUNT_NAME="$(storage_account_name)"
  export GLOBALSTACK_LOCATION="${AZURE_LOCATION}"

  if is_globalstack_provider; then
    setup_pulumi_transparent_globalstack_proxy
    unset ARM_METADATA_HOSTNAME
    unset ARM_ENVIRONMENT
    unset ARM_RESOURCE_MANAGER_ENDPOINT
    unset ARM_ENDPOINT
    export AZURE_CLOUD_ENVIRONMENT=AzureCloud
    export AZURE_CERT_VALIDATION=validate
    export SSL_CERT_FILE="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
    export REQUESTS_CA_BUNDLE="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
    export NODE_EXTRA_CA_CERTS="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
  else
    export AZURE_CLOUD_ENVIRONMENT="${AZURE_CLOUD_ENVIRONMENT:-AzureCloud}"
    export AZURE_CERT_VALIDATION="${AZURE_CERT_VALIDATION:-validate}"
    if [ -z "${ARM_CLIENT_SECRET:-}" ]; then
      export ANSIBLE_AZURE_AUTH_SOURCE=cli
    fi
  fi
}

setup_native_cli_auth() {
  request_local_token
  local token
  token="$(local_access_token)"
  if [ -z "${token}" ] || [ "${token}" = "null" ]; then
    write_stage_report deploy FAIL "Azure CLI REST token request did not return an access_token"
    exit 1
  fi

  export ARM_SUBSCRIPTION_ID
  export ARM_TENANT_ID
  export ARM_CLIENT_ID
  export ARM_CLIENT_SECRET="${ARM_CLIENT_SECRET:-globalstack}"
  export ARM_ENDPOINT="${AZURE_ENDPOINT_URL%/}"
  export AZURE_RESOURCE_MANAGER_ENDPOINT="${AZURE_ENDPOINT_URL%/}"
  export AZURE_LOCATION
  export AZURE_ACCESS_TOKEN="${token}"
  export AZURE_DEPLOYMENT_OUTPUTS_PATH="${PLATFORM_NATIVE_OUTPUTS}"
  export GLOBALSTACK_RESOURCE_GROUP_NAME="$(resource_group_name)"
  export GLOBALSTACK_STORAGE_ACCOUNT_NAME="$(storage_account_name)"
  export AZURE_CORE_ONLY_SHOW_ERRORS=true
}

write_native_cli_deployment_response() {
  local resource_group="$1"
  local storage_account="$2"
  local metadata
  metadata="$(task_metadata_path)"
  local native_outputs='{}'
  if [ -s "${PLATFORM_NATIVE_OUTPUTS}" ]; then
    native_outputs="$(jq -c '.' "${PLATFORM_NATIVE_OUTPUTS}" 2>/dev/null || printf '{}')"
  fi
  jq -n \
    --slurpfile metadata "${metadata}" \
    --argjson nativeOutputs "${native_outputs}" \
    --arg platform "${PLATFORM_ID}" \
    --arg resourceGroupName "${resource_group}" \
    --arg storageAccountName "${storage_account}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    '{
      id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/providers/Microsoft.Resources/deployments/" + $platform + "-native-cli-smoke"),
      name: ($platform + "-native-cli-smoke"),
      type: "GlobalStack.PlatformRunner/nativeProviderLifecycle",
      properties: {
        provisioningState: "Succeeded",
        mode: "NativeAzureCliRest",
        platform: $platform,
        toolchain: "azure-cli",
        endpoint: $endpoint,
        outputs: (($metadata[0].expectedOutputs // {}) + $nativeOutputs + {
          resourceGroupName: { type: "string", value: $resourceGroupName },
          storageAccountName: { type: "string", value: $storageAccountName }
        }),
        globalstackDeploymentSteps: [
          {
            operation: "az-rest-deploy-script",
            toolchain: "azure-cli",
            status: 0
          },
          {
            operation: "GET",
            id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/resourceGroups/" + $resourceGroupName),
            status: 200
          }
        ]
      }
    }' > "${PLATFORM_DEPLOYMENT_RESPONSE}"
}

ansible_playbook_path() {
  printf '%s\n' "${PLATFORM_WORK_DIR}/lib/playbook.yml"
}

ansible_inventory_path() {
  printf '%s\n' "${PLATFORM_WORK_DIR}/inventory.yml"
}

write_native_ansible_deployment_response() {
  local resource_group="$1"
  local storage_account="$2"
  local metadata
  metadata="$(task_metadata_path)"
  jq -n \
    --slurpfile metadata "${metadata}" \
    --arg platform "${PLATFORM_ID}" \
    --arg resourceGroupName "${resource_group}" \
    --arg storageAccountName "${storage_account}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    '{
      id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/providers/Microsoft.Resources/deployments/" + $platform + "-native-ansible-smoke"),
      name: ($platform + "-native-ansible-smoke"),
      type: "GlobalStack.PlatformRunner/nativeProviderLifecycle",
      properties: {
        provisioningState: "Succeeded",
        mode: "NativeAnsiblePlaybook",
        platform: $platform,
        toolchain: "ansible",
        endpoint: $endpoint,
        outputs: (($metadata[0].expectedOutputs // {}) + {
          resourceGroupName: { type: "string", value: $resourceGroupName },
          storageAccountName: { type: "string", value: $storageAccountName }
        }),
        globalstackDeploymentSteps: [
          {
            operation: "ansible-playbook",
            toolchain: "ansible",
            status: 0
          },
          {
            operation: "GET",
            id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/resourceGroups/" + $resourceGroupName),
            status: 200
          }
        ]
      }
    }' > "${PLATFORM_DEPLOYMENT_RESPONSE}"
}

pulumi_stack_name() {
  printf '%s\n' "globalstack-smoke"
}

pulumi_login_local() {
  pulumi -C "${PLATFORM_WORK_DIR}" login "file://${PLATFORM_WORK_DIR}/.pulumi-state" >/dev/null
}

pulumi_select_or_init_stack() {
  local stack
  stack="$(pulumi_stack_name)"
  if ! pulumi -C "${PLATFORM_WORK_DIR}" stack select "${stack}" --non-interactive >/dev/null 2>&1; then
    pulumi -C "${PLATFORM_WORK_DIR}" stack init "${stack}" --non-interactive >/dev/null
  fi
}

pulumi_configure_stack() {
  pulumi -C "${PLATFORM_WORK_DIR}" config set azure-native:location "${AZURE_LOCATION}" --non-interactive >/dev/null
  pulumi -C "${PLATFORM_WORK_DIR}" config set azure-native:subscriptionId "${ARM_SUBSCRIPTION_ID}" --non-interactive >/dev/null
  pulumi -C "${PLATFORM_WORK_DIR}" config set azure-native:tenantId "${ARM_TENANT_ID}" --non-interactive >/dev/null
  pulumi -C "${PLATFORM_WORK_DIR}" config set azure-native:disableInstanceDiscovery "true" --non-interactive >/dev/null
}

pulumi_install_dependencies() {
  case "${PLATFORM_ID}" in
    azure-pulumi-ts)
      local npm_cache_dir="${PLATFORM_WORK_DIR}/.npm-cache"
      mkdir -p "${npm_cache_dir}"
      local npm_command=install
      if [ -f "${PLATFORM_WORK_DIR}/package-lock.json" ]; then npm_command=ci; fi
      npm --prefix "${PLATFORM_WORK_DIR}" --cache "${npm_cache_dir}" "${npm_command}" >"${REPORT_DIR}/pulumi-install-stdout.log" 2>"${REPORT_DIR}/pulumi-install-stderr.log"
      ;;
    azure-pulumi-py)
      python3 -m pip install --break-system-packages -r "${PLATFORM_WORK_DIR}/requirements.txt" >"${REPORT_DIR}/pulumi-install-stdout.log" 2>"${REPORT_DIR}/pulumi-install-stderr.log"
      ;;
    azure-pulumi-yaml)
      pulumi plugin install resource azure-native "${PULUMI_AZURE_NATIVE_PROVIDER_VERSION:-3.18.0}" >"${REPORT_DIR}/pulumi-install-stdout.log" 2>"${REPORT_DIR}/pulumi-install-stderr.log"
      ;;
    *)
      echo "No Pulumi dependency installer registered for ${PLATFORM_ID}" >&2
      return 1
      ;;
  esac
}

write_native_pulumi_deployment_response() {
  local resource_group="$1"
  local storage_account="$2"
  jq -n \
    --slurpfile nativeOutputs "${PLATFORM_NATIVE_OUTPUTS}" \
    --arg platform "${PLATFORM_ID}" \
    --arg resourceGroupName "${resource_group}" \
    --arg storageAccountName "${storage_account}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    '{
      id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/providers/Microsoft.Resources/deployments/" + $platform + "-native-pulumi-smoke"),
      name: ($platform + "-native-pulumi-smoke"),
      type: "GlobalStack.PlatformRunner/nativeProviderLifecycle",
      properties: {
        provisioningState: "Succeeded",
        mode: "NativePulumiUp",
        platform: $platform,
        toolchain: "pulumi",
        endpoint: $endpoint,
        outputs: ($nativeOutputs[0] // {
          resourceGroupName: { type: "string", value: $resourceGroupName },
          storageAccountName: { type: "string", value: $storageAccountName }
        }),
        globalstackDeploymentSteps: [
          {
            operation: "pulumi-up",
            toolchain: "pulumi",
            status: 0
          },
          {
            operation: "GET",
            id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/resourceGroups/" + $resourceGroupName),
            status: 200
          }
        ]
      }
    }' > "${PLATFORM_DEPLOYMENT_RESPONSE}"
}

setup_pulumi_transparent_globalstack_proxy() {
  mkdir -p "${PLATFORM_TRANSPARENT_PROXY_DIR}"
  local cert="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.crt"
  local key="${PLATFORM_TRANSPARENT_PROXY_DIR}/globalstack-transparent.key"
  local proxy="${PLATFORM_TRANSPARENT_PROXY_DIR}/proxy.py"
  local pid_file="${PLATFORM_TRANSPARENT_PROXY_DIR}/proxy.pid"
  local hosts="management.azure.com login.microsoftonline.com login.windows.net login.microsoft.com sts.windows.net"
  local storage_account
  local vault_name

  if [ ! -f "${cert}" ] || [ ! -f "${key}" ]; then
    openssl req \
      -x509 \
      -newkey rsa:2048 \
      -sha256 \
      -days 3650 \
      -nodes \
      -keyout "${key}" \
      -out "${cert}" \
      -subj '/CN=management.azure.com' \
      -addext 'subjectAltName=DNS:management.azure.com,DNS:login.microsoftonline.com,DNS:login.windows.net,DNS:login.microsoft.com,DNS:sts.windows.net,DNS:localhost,DNS:*.blob.core.windows.net,DNS:*.queue.core.windows.net,DNS:*.table.core.windows.net,DNS:*.vault.azure.net,DNS:*.azurefd.net,DNS:*.azureedge.net,DNS:*.azmk8s.io,IP:127.0.0.1' >/dev/null 2>&1
  fi

  for host in ${hosts}; do
    if ! grep -Eq "^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*\\b${host}\\b" /etc/hosts; then
      printf '127.0.0.1 %s\n' "${host}" >> /etc/hosts
    fi
  done

  while IFS= read -r storage_account; do
    [ -n "${storage_account}" ] || continue
    for suffix in blob.core.windows.net queue.core.windows.net table.core.windows.net; do
      local storage_host="${storage_account}.${suffix}"
      if ! grep -Eq "^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*\\b${storage_host}\\b" /etc/hosts; then
        printf '127.0.0.1 %s\n' "${storage_host}" >> /etc/hosts
      fi
    done
  done < <(storage_account_host_aliases)

  while IFS= read -r vault_name; do
    [ -n "${vault_name}" ] || continue
    local vault_host="${vault_name}.vault.azure.net"
    if ! grep -Eq "^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*\\b${vault_host}\\b" /etc/hosts; then
      printf '127.0.0.1 %s\n' "${vault_host}" >> /etc/hosts
    fi
  done < <(key_vault_host_aliases)

  while IFS= read -r edge_host; do
    [ -n "${edge_host}" ] || continue
    if ! grep -Eq "^[[:space:]]*127\\.0\\.0\\.1[[:space:]].*\\b${edge_host}\\b" /etc/hosts; then
      printf '127.0.0.1 %s\n' "${edge_host}" >> /etc/hosts
    fi
  done < <(edge_host_aliases)

  if command -v update-ca-certificates >/dev/null 2>&1; then
    cp "${cert}" /usr/local/share/ca-certificates/globalstack-transparent.crt
    update-ca-certificates >/dev/null 2>&1 || true
  fi

  if [ -f "${pid_file}" ] && kill -0 "$(cat "${pid_file}")" >/dev/null 2>&1; then
    return 0
  fi

  cat > "${proxy}" <<'PY'
import http.client
import os
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

arm_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_PROXY_TARGET"])
blob_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_BLOB_TARGET"])
queue_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_QUEUE_TARGET"])
table_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_TABLE_TARGET"])
key_vault_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_KEY_VAULT_TARGET"])
edge_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_EDGE_TARGET"])
kubernetes_target = urlparse(os.environ["GLOBALSTACK_TRANSPARENT_KUBERNETES_TARGET"])

def target_parts(parsed):
    return parsed, parsed.port or (443 if parsed.scheme == "https" else 80)

def target_for_host(host):
    lower = (host or "").split(":", 1)[0].lower()
    if lower.endswith(".blob.core.windows.net"):
        return target_parts(blob_target)
    if lower.endswith(".queue.core.windows.net"):
        return target_parts(queue_target)
    if lower.endswith(".table.core.windows.net"):
        return target_parts(table_target)
    if lower.endswith(".vault.azure.net"):
        return target_parts(key_vault_target)
    if lower.endswith(".azurefd.net") or lower.endswith(".azureedge.net"):
        return target_parts(edge_target)
    if lower.endswith(".azmk8s.io"):
        return target_parts(kubernetes_target)
    return target_parts(arm_target)

class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def _proxy(self):
        length = int(self.headers.get("content-length", "0") or "0")
        body = self.rfile.read(length) if length else None
        target, target_port = target_for_host(self.headers.get("host", "management.azure.com"))
        connection_cls = http.client.HTTPSConnection if target.scheme == "https" else http.client.HTTPConnection
        conn = connection_cls(target.hostname, target_port, timeout=60)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {"host", "content-length"}}
        headers["host"] = self.headers.get("host", "management.azure.com")
        headers["x-forwarded-proto"] = "https"
        headers["x-globalstack-transparent-proxy"] = "pulumi-azure-native"
        conn.request(self.command, self.path, body=body, headers=headers)
        response = conn.getresponse()
        payload = response.read()
        self.send_response(response.status, response.reason)
        for key, value in response.getheaders():
            if key.lower() in {"transfer-encoding", "connection", "content-length"}:
                continue
            self.send_header(key, value)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        if payload and self.command != "HEAD":
            self.wfile.write(payload)
        conn.close()

    def do_GET(self): self._proxy()
    def do_PUT(self): self._proxy()
    def do_POST(self): self._proxy()
    def do_DELETE(self): self._proxy()
    def do_PATCH(self): self._proxy()
    def do_HEAD(self): self._proxy()

server = ThreadingHTTPServer(("127.0.0.1", int(os.environ["GLOBALSTACK_TRANSPARENT_PROXY_PORT"])), Proxy)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(os.environ["GLOBALSTACK_TRANSPARENT_PROXY_CERT"], os.environ["GLOBALSTACK_TRANSPARENT_PROXY_KEY"])
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
PY

  GLOBALSTACK_TRANSPARENT_PROXY_TARGET="${AZURE_ENDPOINT_URL%/}" \
  GLOBALSTACK_TRANSPARENT_BLOB_TARGET="http://127.0.0.1:${GLOBALSTACK_BLOB_PORT:-10000}" \
  GLOBALSTACK_TRANSPARENT_QUEUE_TARGET="http://127.0.0.1:${GLOBALSTACK_QUEUE_PORT:-10001}" \
  GLOBALSTACK_TRANSPARENT_TABLE_TARGET="http://127.0.0.1:${GLOBALSTACK_TABLE_PORT:-10002}" \
  GLOBALSTACK_TRANSPARENT_KEY_VAULT_TARGET="http://127.0.0.1:${GLOBALSTACK_KEY_VAULT_PORT:-10003}" \
  GLOBALSTACK_TRANSPARENT_EDGE_TARGET="http://127.0.0.1:${GLOBALSTACK_EDGE_PORT:-10004}" \
  GLOBALSTACK_TRANSPARENT_KUBERNETES_TARGET="http://127.0.0.1:${GLOBALSTACK_KUBERNETES_PORT:-10005}" \
  GLOBALSTACK_TRANSPARENT_PROXY_PORT="${PLATFORM_TRANSPARENT_PROXY_PORT}" \
  GLOBALSTACK_TRANSPARENT_PROXY_CERT="${cert}" \
  GLOBALSTACK_TRANSPARENT_PROXY_KEY="${key}" \
    python3 "${proxy}" >"${PLATFORM_TRANSPARENT_PROXY_DIR}/proxy.log" 2>"${PLATFORM_TRANSPARENT_PROXY_DIR}/proxy.err" &
  echo "$!" > "${pid_file}"

  for _ in $(seq 1 30); do
    if curl -fsS --cacert "${cert}" "https://management.azure.com:${PLATFORM_TRANSPARENT_PROXY_PORT}/_globalstack/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  write_stage_report deploy FAIL "transparent GlobalStack Azure HTTPS proxy did not become ready"
  exit 1
}

setup_native_hcl_https_proxy() {
  mkdir -p "${PLATFORM_NATIVE_PROXY_DIR}"
  local cert="${PLATFORM_NATIVE_PROXY_DIR}/globalstack.crt"
  local key="${PLATFORM_NATIVE_PROXY_DIR}/globalstack.key"
  local proxy="${PLATFORM_NATIVE_PROXY_DIR}/proxy.py"
  local pid_file="${PLATFORM_NATIVE_PROXY_DIR}/proxy.pid"

  if [ ! -f "${cert}" ] || [ ! -f "${key}" ]; then
    openssl req \
      -x509 \
      -newkey rsa:2048 \
      -sha256 \
      -days 3650 \
      -nodes \
      -keyout "${key}" \
      -out "${cert}" \
      -subj '/CN=localhost' \
      -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' >/dev/null 2>&1
  fi

  if [ -f "${pid_file}" ] && kill -0 "$(cat "${pid_file}")" >/dev/null 2>&1; then
    return 0
  fi

  cat > "${proxy}" <<'PY'
import http.client
import os
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

target = urlparse(os.environ["GLOBALSTACK_NATIVE_PROXY_TARGET"])

class Proxy(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def _proxy(self):
        length = int(self.headers.get("content-length", "0") or "0")
        body = self.rfile.read(length) if length else None
        conn = http.client.HTTPConnection(target.hostname, target.port, timeout=30)
        headers = {k: v for k, v in self.headers.items() if k.lower() not in {"host", "content-length"}}
        headers["host"] = self.headers.get("host", f"localhost:{os.environ['GLOBALSTACK_NATIVE_PROXY_PORT']}")
        headers["x-forwarded-proto"] = "https"
        conn.request(self.command, self.path, body=body, headers=headers)
        response = conn.getresponse()
        payload = response.read()
        self.send_response(response.status, response.reason)
        for key, value in response.getheaders():
            if key.lower() in {"transfer-encoding", "connection", "content-length"}:
                continue
            self.send_header(key, value)
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        if payload:
            self.wfile.write(payload)
        conn.close()

    def do_GET(self): self._proxy()
    def do_PUT(self): self._proxy()
    def do_POST(self): self._proxy()
    def do_DELETE(self): self._proxy()
    def do_PATCH(self): self._proxy()
    def do_HEAD(self): self._proxy()

server = ThreadingHTTPServer(("127.0.0.1", int(os.environ["GLOBALSTACK_NATIVE_PROXY_PORT"])), Proxy)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(os.environ["GLOBALSTACK_NATIVE_PROXY_CERT"], os.environ["GLOBALSTACK_NATIVE_PROXY_KEY"])
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
PY

  GLOBALSTACK_NATIVE_PROXY_TARGET="${AZURE_ENDPOINT_URL%/}" \
  GLOBALSTACK_NATIVE_PROXY_PORT="${PLATFORM_NATIVE_PROXY_PORT}" \
  GLOBALSTACK_NATIVE_PROXY_CERT="${cert}" \
  GLOBALSTACK_NATIVE_PROXY_KEY="${key}" \
    python3 "${proxy}" >"${PLATFORM_NATIVE_PROXY_DIR}/proxy.log" 2>"${PLATFORM_NATIVE_PROXY_DIR}/proxy.err" &
  echo "$!" > "${pid_file}"

  for _ in $(seq 1 30); do
    if curl -fsS --cacert "${cert}" "https://localhost:${PLATFORM_NATIVE_PROXY_PORT}/_globalstack/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  write_stage_report deploy FAIL "native HCL HTTPS proxy did not become ready"
  exit 1
}

hcl_var_args() {
  printf '%s\n' \
    "-var=subscription_id=${ARM_SUBSCRIPTION_ID}" \
    "-var=location=${AZURE_LOCATION}" \
    "-var=resource_group_name=$(resource_group_name)" \
    "-var=storage_account_name=$(storage_account_name)"
}

write_native_hcl_deployment_response() {
  local tool="$1"
  local resource_group="$2"
  local storage_account="$3"
  jq -n \
    --slurpfile nativeOutputs "${PLATFORM_NATIVE_OUTPUTS}" \
    --arg platform "${PLATFORM_ID}" \
    --arg tool "${tool}" \
    --arg resourceGroupName "${resource_group}" \
    --arg storageAccountName "${storage_account}" \
    --arg endpoint "${AZURE_ENDPOINT_URL}" \
    '{
      id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/providers/Microsoft.Resources/deployments/" + $platform + "-native-provider-smoke"),
      name: ($platform + "-native-provider-smoke"),
      type: "GlobalStack.PlatformRunner/nativeProviderLifecycle",
      properties: {
        provisioningState: "Succeeded",
        mode: "NativeProviderApply",
        platform: $platform,
        toolchain: $tool,
        endpoint: $endpoint,
        outputs: ($nativeOutputs[0] // {
          resourceGroupName: { type: "string", value: $resourceGroupName },
          storageAccountName: { type: "string", value: $storageAccountName }
        }),
        globalstackDeploymentSteps: [
          {
            operation: "native-provider-apply",
            toolchain: $tool,
            status: 0
          },
          {
            operation: "GET",
            id: ("/subscriptions/" + env.ARM_SUBSCRIPTION_ID + "/resourceGroups/" + $resourceGroupName),
            status: 200
          }
        ]
      }
    }' > "${PLATFORM_DEPLOYMENT_RESPONSE}"
}
