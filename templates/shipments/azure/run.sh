#!/usr/bin/env bash
set -uo pipefail

echo "Initializing GlobalStack shipment runner..."

export LIB_DIR="$(cd "$(dirname "$0")" && pwd)" || exit 1
export PARENT_DIR="$LIB_DIR"

TASK_FOLDER=$(find "$LIB_DIR" -mindepth 1 -maxdepth 1 -type d -name "Pr[0-9]*" | head -1)
if [ -z "$TASK_FOLDER" ]; then
  echo "Error: No task folder found matching pattern Pr[0-9]* in $LIB_DIR" >&2
  exit 1
fi

TASK_NAME=$(basename "$TASK_FOLDER")
export TASK_NAME
export ENVIRONMENT_SUFFIX="$(printf '%s' "$TASK_NAME" | tr '[:upper:]' '[:lower:]')"
export LOCAL_TASK_PATH="$TASK_FOLDER"
export SHIPMENT_DOCKER_DIR="$LIB_DIR/docker"
export REPORT_DIR="$SHIPMENT_DOCKER_DIR/reports"
export WORK_DIR="$SHIPMENT_DOCKER_DIR/work"
export VOLUME_DIR="$SHIPMENT_DOCKER_DIR/volume"
export EXECUTION_LOG_PATH="$LIB_DIR/execution.log"
export EXECUTION_REPORT_PATH="$LIB_DIR/execution-report.json"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-globalstack-${ENVIRONMENT_SUFFIX}}"
export AZURE_LOCATION="${AZURE_LOCATION:-eastus}"
export CLOUD_PROVIDER="${CLOUD_PROVIDER:-azure}"
export PIPELINE_STAGE_SCOPE="${PIPELINE_STAGE_SCOPE:-full}"

METADATA_PATH="$LOCAL_TASK_PATH/metadata.json"
if [ ! -f "$METADATA_PATH" ]; then
  echo "Error: metadata.json not found under $LOCAL_TASK_PATH" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required to run this shipment" >&2
  exit 1
fi

export PROVIDER="$(jq -r '.provider // "GlobalStack"' "$METADATA_PATH")"
export PLATFORM_ID="$(jq -r '.platformId // empty' "$METADATA_PATH")"
export MODEL_ID="$(jq -r '.model // empty' "$METADATA_PATH")"

if [ -z "$PLATFORM_ID" ]; then
  echo "Error: metadata.json is missing platformId" >&2
  exit 1
fi

case "$PLATFORM_ID" in
  azure-terraform-hcl)
    export LANGUAGE="hcl"
    export TOOLCHAIN="terraform"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-terraform-hcl:local"
    ;;
  azure-opentofu-hcl)
    export LANGUAGE="hcl"
    export TOOLCHAIN="opentofu"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-opentofu-hcl:local"
    ;;
  azure-pulumi-ts)
    export LANGUAGE="ts"
    export TOOLCHAIN="pulumi"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-pulumi-ts:local"
    ;;
  azure-pulumi-py)
    export LANGUAGE="py"
    export TOOLCHAIN="pulumi"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-pulumi-py:local"
    ;;
  azure-pulumi-yaml)
    export LANGUAGE="yaml"
    export TOOLCHAIN="pulumi"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-pulumi-yaml:local"
    ;;
  azure-ansible-yaml)
    export LANGUAGE="yaml"
    export TOOLCHAIN="ansible"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-ansible-yaml:local"
    ;;
  azure-bicep)
    export LANGUAGE="bicep"
    export TOOLCHAIN="bicep"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-bicep:local"
    ;;
  azure-arm-json)
    export LANGUAGE="json"
    export TOOLCHAIN="arm"
    DEFAULT_RUNNER_IMAGE="globalstack/azure-arm-json:local"
    ;;
  *)
    echo "Error: unsupported platformId '$PLATFORM_ID'" >&2
    exit 1
    ;;
esac

export GLOBALSTACK_AZURE_IMAGE="${GLOBALSTACK_AZURE_IMAGE:-globalstack/azure-emulator:local}"
export GLOBALSTACK_RUNNER_IMAGE="${GLOBALSTACK_RUNNER_IMAGE:-$DEFAULT_RUNNER_IMAGE}"

normalized_provider="$(printf '%s' "$PROVIDER" | tr '[:upper:]' '[:lower:]' | tr -d ' _-')"
if [ "$normalized_provider" = "globalstack" ] || [ -z "$normalized_provider" ]; then
  if [ -z "${GLOBALSTACK_AUTH_TOKEN:-}" ]; then
    case "$GLOBALSTACK_AZURE_IMAGE" in
      *:local)
        export GLOBALSTACK_AUTH_TOKEN="globalstack-local-token"
        ;;
      *)
        echo "Error: GLOBALSTACK_AUTH_TOKEN must be set for non-local GlobalStack images" >&2
        exit 1
        ;;
    esac
  fi
else
  export GLOBALSTACK_AUTH_TOKEN="${GLOBALSTACK_AUTH_TOKEN:-globalstack-local-token}"
fi

docker_prefix=()
if docker info >/dev/null 2>&1; then
  :
elif sudo -n docker info >/dev/null 2>&1; then
  docker_prefix=(sudo -n -E)
else
  echo "Error: unable to reach Docker. Ensure docker is installed and the current user can access it." >&2
  exit 1
fi

docker_cmd() {
  "${docker_prefix[@]}" docker "$@"
}

maybe_source_root() {
  if [ -n "${GLOBALSTACK_SOURCE_ROOT:-}" ] && [ -f "${GLOBALSTACK_SOURCE_ROOT}/package.json" ]; then
    printf '%s\n' "${GLOBALSTACK_SOURCE_ROOT}"
    return 0
  fi
  local candidate
  for candidate in \
    "$LIB_DIR/../../../../../globalstack" \
    "$LIB_DIR/../../../../globalstack" \
    "$PWD/../globalstack" \
    "$PWD/../../globalstack"
  do
    candidate="$(cd "$candidate" 2>/dev/null && pwd)" || true
    if [ -n "$candidate" ] && [ -f "$candidate/package.json" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

ensure_local_image() {
  local image="$1"
  if docker_cmd image inspect "$image" >/dev/null 2>&1; then
    return 0
  fi

  case "$image" in
    *:local)
      local source_root
      source_root="$(maybe_source_root)" || true
      if [ -n "$source_root" ]; then
        echo "Local image '$image' not found. Building from $source_root for $PLATFORM_ID..."
        if ! (cd "$source_root" && node scripts/runtime/build-platform-images.mjs --platform="$PLATFORM_ID"); then
          echo "Error: failed to build required local images for $PLATFORM_ID" >&2
          exit 1
        fi
        return 0
      fi
      echo "Error: local image '$image' not found and no GlobalStack source workspace was available to build it." >&2
      exit 1
      ;;
    *)
      echo "Image '$image' not found locally. Docker will attempt to pull it during compose up."
      ;;
  esac
}

ensure_local_image "$GLOBALSTACK_AZURE_IMAGE"
ensure_local_image "$GLOBALSTACK_RUNNER_IMAGE"

mkdir -p "$REPORT_DIR" "$WORK_DIR" "$VOLUME_DIR"
rm -f "$EXECUTION_LOG_PATH" "$EXECUTION_REPORT_PATH"

echo "Starting shipment runner"
echo "Task folder: $LOCAL_TASK_PATH"
echo "Platform: $PLATFORM_ID"
echo "Provider: $PROVIDER"
echo "Toolchain: $TOOLCHAIN"
echo "Region: $AZURE_LOCATION"
echo "Runner image: $GLOBALSTACK_RUNNER_IMAGE"
echo "Emulator image: $GLOBALSTACK_AZURE_IMAGE"

cd "$SHIPMENT_DOCKER_DIR" || exit 1

exec 1> >(tee "$EXECUTION_LOG_PATH")
exec 2>&1

compose_exit_code=0
docker_cmd compose up --abort-on-container-exit --exit-code-from runner runner || compose_exit_code=$?

docker_cmd compose down --remove-orphans >/dev/null 2>&1 || true

normalize_shipment_ownership() {
  local uid gid
  uid="$(id -u)"
  gid="$(id -g)"

  if [ "${#docker_prefix[@]}" -gt 0 ]; then
    sudo -n chown -R "${uid}:${gid}" "$LIB_DIR" >/dev/null 2>&1 || true
    return 0
  fi

  docker_cmd run --rm \
    -v "$LIB_DIR:/shipment" \
    --entrypoint sh \
    "$GLOBALSTACK_AZURE_IMAGE" \
    -lc "chown -R ${uid}:${gid} /shipment" >/dev/null 2>&1 || true
}

normalize_shipment_ownership

stage_status() {
  local stage="$1"
  local path="$REPORT_DIR/stage-${stage}.json"
  if [ -f "$path" ]; then
    jq -r '.status // "FAIL"' "$path" 2>/dev/null || printf '%s\n' "FAIL"
    return 0
  fi
  printf '%s\n' "NOT_RUN"
}

log_section() {
  local title="$1"
  printf '\n========== %s ==========\n' "$title"
}

log_file_if_present() {
  local label="$1"
  local path="$2"
  if [ -f "$path" ]; then
    log_section "$label"
    cat "$path"
    case "$(tail -c 1 "$path" 2>/dev/null || true)" in
      "") ;;
      *) printf '\n' ;;
    esac
  fi
}

log_stage_summary() {
  log_section "Stage Summary"
  printf 'build=%s\n' "$(stage_status build)"
  printf 'lint=%s\n' "$(stage_status lint)"
  printf 'unit-tests=%s\n' "$(stage_status unit-tests)"
  printf 'deploy=%s\n' "$(stage_status deploy)"
  printf 'provider-lifecycle=%s\n' "$(stage_status provider-lifecycle)"
  printf 'integration-tests=%s\n' "$(stage_status integration-tests)"
  printf 'destroy=%s\n' "$(stage_status destroy)"
}

append_detailed_execution_log() {
  log_stage_summary
  log_file_if_present "Lifecycle Report" "$REPORT_DIR/lifecycle-report.json"

  for stage in build lint unit-tests deploy provider-lifecycle integration-tests destroy; do
    log_file_if_present "Stage Report: ${stage}" "$REPORT_DIR/stage-${stage}.json"
  done

  log_file_if_present "Unit Test Stdout" "$REPORT_DIR/unit-tests-task-stdout.log"
  log_file_if_present "Unit Test Stderr" "$REPORT_DIR/unit-tests-task-stderr.log"
  log_file_if_present "Integration Test Stdout" "$REPORT_DIR/integration-tests-task-stdout.log"
  log_file_if_present "Integration Test Stderr" "$REPORT_DIR/integration-tests-task-stderr.log"

  log_file_if_present "Native Deploy Stdout" "$REPORT_DIR/native-stdout.log"
  log_file_if_present "Native Deploy Stderr" "$REPORT_DIR/native-stderr.log"
  log_file_if_present "Provider Lifecycle Response" "$REPORT_DIR/provider-lifecycle-response.json"
  log_file_if_present "Provider Lifecycle Stdout" "$REPORT_DIR/provider-lifecycle-stdout.log"
  log_file_if_present "Provider Lifecycle Stderr" "$REPORT_DIR/provider-lifecycle-stderr.log"
  log_file_if_present "Deployment Response" "$REPORT_DIR/deployment-response.json"
  log_file_if_present "Native Outputs" "$REPORT_DIR/native-outputs.json"
  log_file_if_present "Resource Group Readback" "$REPORT_DIR/resource-group-get.json"
  log_file_if_present "Destroy Stdout" "$REPORT_DIR/native-destroy-stdout.log"
  log_file_if_present "Destroy Stderr" "$REPORT_DIR/native-destroy-stderr.log"

  log_section "Report Files"
  find "$REPORT_DIR" -maxdepth 1 -type f | sort
}

final_stage=""
final_status=""
if [ -f "$REPORT_DIR/lifecycle-report.json" ]; then
  final_stage="$(jq -r '.stage // empty' "$REPORT_DIR/lifecycle-report.json" 2>/dev/null || true)"
  final_status="$(jq -r '.status // empty' "$REPORT_DIR/lifecycle-report.json" 2>/dev/null || true)"
fi

provisioning_state=""
if [ -f "$REPORT_DIR/deployment-response.json" ]; then
  provisioning_state="$(jq -r '.properties.provisioningState // empty' "$REPORT_DIR/deployment-response.json" 2>/dev/null || true)"
fi

provider_lifecycle_ok="false"
if [ -f "$REPORT_DIR/provider-lifecycle-response.json" ]; then
  provider_lifecycle_ok="$(jq -r 'if .status == "PASS" and (.operations | type == "array") and (.operations | length > 0) and ([.operations[].status == "PASS"] | all) then "true" else "false" end' "$REPORT_DIR/provider-lifecycle-response.json" 2>/dev/null || printf '%s' "false")"
fi

overall_status="FAIL"
if [ "$compose_exit_code" -eq 0 ] && [ "$final_status" = "PASS" ] && [ "$final_stage" = "destroy" ] && [ "$provisioning_state" = "Succeeded" ] && [ "$provider_lifecycle_ok" = "true" ]; then
  overall_status="PASS"
fi

jq -n \
  --arg platform "$PLATFORM_ID" \
  --arg build "$(stage_status build)" \
  --arg lint "$(stage_status lint)" \
  --arg unit "$(stage_status unit-tests)" \
  --arg deploy "$(stage_status deploy)" \
  --arg providerLifecycle "$(stage_status provider-lifecycle)" \
  --arg integration "$(stage_status integration-tests)" \
  --arg destroy "$(stage_status destroy)" \
  --arg finalStage "$final_stage" \
  --arg finalStatus "$final_status" \
  --arg provisioningState "$provisioning_state" \
  --argjson providerLifecycleOk "$provider_lifecycle_ok" \
  --arg overallStatus "$overall_status" \
  '{
    platform: $platform,
    build_status: $build,
    lint_status: $lint,
    unit_tests_status: $unit,
    deploy_status: $deploy,
    provider_lifecycle_status: $providerLifecycle,
    integration_status: $integration,
    destroy_status: $destroy,
    final_stage: (if $finalStage == "" then null else $finalStage end),
    final_status: (if $finalStatus == "" then null else $finalStatus end),
    provisioning_state: (if $provisioningState == "" then null else $provisioningState end),
    provider_lifecycle_ok: $providerLifecycleOk,
    overall_status: $overallStatus
  }' > "$EXECUTION_REPORT_PATH"

append_detailed_execution_log

echo "Execution report written to $EXECUTION_REPORT_PATH"
echo "Execution log written to $EXECUTION_LOG_PATH"

exit "$compose_exit_code"
