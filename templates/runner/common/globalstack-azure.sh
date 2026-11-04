#!/usr/bin/env bash

setup_globalstack_azure_env() {
  local task_dir="${TASK_DIR:-/workspace/task}"
  local metadata_provider=""
  if [ -f "${task_dir}/metadata.json" ]; then
    metadata_provider="$(jq -r '.provider // .targetProvider // .cloudProvider // empty' "${task_dir}/metadata.json" 2>/dev/null || true)"
  fi

  local raw_provider="${metadata_provider:-${PROVIDER:-${CLOUD_PROVIDER:-${GLOBALSTACK_PROVIDER:-GlobalStack}}}}"
  local normalized_provider
  normalized_provider="$(printf '%s' "${raw_provider}" | tr '[:upper:]' '[:lower:]' | tr -d ' _-')"

  case "${normalized_provider}" in
    azure|microsoftazure)
      export GLOBALSTACK_TARGET_PROVIDER="azure"
      export PROVIDER="Azure"
      ;;
    globalstack|globalstackazure|local|localazure|"")
      export GLOBALSTACK_TARGET_PROVIDER="globalstack"
      export PROVIDER="GlobalStack"
      ;;
    *)
      echo "[globalstack-azure] unsupported provider '${raw_provider}'. Use Azure or GlobalStack." >&2
      exit 1
      ;;
  esac

  if [ "${GLOBALSTACK_TARGET_PROVIDER}" = "azure" ]; then
    local endpoint="${AZURE_ENDPOINT_URL:-}"
    if [ -z "${endpoint}" ] || [ "${endpoint%/}" = "http://localhost:4566" ] || [ "${endpoint%/}" = "http://127.0.0.1:4566" ]; then
      endpoint="https://management.azure.com"
    fi
    export AZURE_ENDPOINT_URL="${endpoint%/}"
    if [ -z "${ARM_ENDPOINT:-}" ] || [ "${ARM_ENDPOINT%/}" = "http://localhost:4566" ] || [ "${ARM_ENDPOINT%/}" = "http://127.0.0.1:4566" ]; then
      export ARM_ENDPOINT="${endpoint%/}"
    fi
    if [ -z "${ARM_RESOURCE_MANAGER_ENDPOINT:-}" ] || [ "${ARM_RESOURCE_MANAGER_ENDPOINT%/}" = "http://localhost:4566" ] || [ "${ARM_RESOURCE_MANAGER_ENDPOINT%/}" = "http://127.0.0.1:4566" ]; then
      export ARM_RESOURCE_MANAGER_ENDPOINT="${endpoint%/}/"
    fi
    export AZURE_LOCATION="${AZURE_LOCATION:-eastus}"
    export AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-/tmp/azure-config}"
    export AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY="${AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY:-false}"

    if [ -z "${ARM_SUBSCRIPTION_ID:-}" ] || [ "${ARM_SUBSCRIPTION_ID}" = "00000000-0000-0000-0000-000000000000" ]; then
      echo "[globalstack-azure] provider=Azure requires a real ARM_SUBSCRIPTION_ID." >&2
      exit 1
    fi

    echo "[globalstack-azure] provider=Azure endpoint=${AZURE_ENDPOINT_URL} location=${AZURE_LOCATION}"
    return 0
  fi

  local host="${GLOBALSTACK_AZURE_HOST:-localhost}"
  local endpoint="${GLOBALSTACK_AZURE_ENDPOINT:-http://${host}:4566}"

  export AZURE_ENDPOINT_URL="${AZURE_ENDPOINT_URL:-${endpoint}}"
  export ARM_ENDPOINT="${ARM_ENDPOINT:-${endpoint}}"
  export ARM_RESOURCE_MANAGER_ENDPOINT="${ARM_RESOURCE_MANAGER_ENDPOINT:-${endpoint}/}"
  export ARM_METADATA_HOSTNAME="${ARM_METADATA_HOSTNAME:-${host}:4566}"
  export AZURE_LOCATION="${AZURE_LOCATION:-eastus}"

  export ARM_CLIENT_ID="${ARM_CLIENT_ID:-11111111-1111-1111-1111-111111111111}"
  export ARM_CLIENT_SECRET="${ARM_CLIENT_SECRET:-globalstack}"
  export ARM_TENANT_ID="${ARM_TENANT_ID:-00000000-0000-0000-0000-000000000000}"
  export ARM_SUBSCRIPTION_ID="${ARM_SUBSCRIPTION_ID:-00000000-0000-0000-0000-000000000000}"
  export AZURE_CONFIG_DIR="${AZURE_CONFIG_DIR:-/tmp/globalstack-azure-config}"
  export AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY="${AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY:-true}"

  echo "[globalstack-azure] provider=GlobalStack endpoint=${AZURE_ENDPOINT_URL} location=${AZURE_LOCATION}"
}

wait_for_globalstack_azure() {
  local endpoint="${GLOBALSTACK_AZURE_ENDPOINT:-http://${GLOBALSTACK_AZURE_HOST:-localhost}:4566}"
  local url="${endpoint%/}/_globalstack/health"
  local max_wait="${GLOBALSTACK_WAIT_TIMEOUT:-120}"
  local interval=5
  local elapsed=0

  echo "[globalstack-azure] Waiting for ${url} (timeout ${max_wait}s)"
  until curl -sf "${url}" >/dev/null 2>&1; do
    if [ "${elapsed}" -ge "${max_wait}" ]; then
      echo "[globalstack-azure] emulator did not become ready within ${max_wait}s" >&2
      exit 1
    fi
    sleep "${interval}"
    elapsed=$((elapsed + interval))
    echo "[globalstack-azure] ... ${elapsed}s elapsed"
  done

  echo "[globalstack-azure] Ready"
  curl -s "${url}" | jq . 2>/dev/null || true
}
