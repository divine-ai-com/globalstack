#!/usr/bin/env bash
set -uo pipefail

ROOT="/workspace"
TASK_DIR="${LOCAL_TASK_PATH:-/workspace/task}"
STAGE_SCOPE="${PIPELINE_STAGE_SCOPE:-local-only}"
PLATFORM_ID="${PLATFORM_ID:-unknown}"
REPORT_DIR="${GLOBALSTACK_REPORT_DIR:-/workspace/reports}"
WORK_DIR="${GLOBALSTACK_WORK_DIR:-/workspace/work}"

log() {
  echo "[$(date -u '+%H:%M:%S')] $*"
}

source /opt/globalstack/globalstack-azure.sh

log "GlobalStack Azure runner starting: platform=${PLATFORM_ID} scope=${STAGE_SCOPE}"
log "Task path: ${TASK_DIR}"
log "Report path: ${REPORT_DIR}"

if [ ! -d "${TASK_DIR}" ]; then
  log "[ERROR] Task path does not exist: ${TASK_DIR}"
  exit 1
fi

setup_globalstack_azure_env
mkdir -p "${REPORT_DIR}" "${WORK_DIR}"

if [ "${STAGE_SCOPE}" != "local-only" ]; then
  if [ "${GLOBALSTACK_TARGET_PROVIDER}" = "globalstack" ]; then
    wait_for_globalstack_azure
  else
    log "provider=Azure selected, skipping GlobalStack readiness wait."
  fi
  stage_family="arm-contract"
  if [ "${PLATFORM_ID}" = "azure-bicep" ]; then
    stage_family="bicep"
  fi

  stages=(${PIPELINE_STAGES:-build lint unit-tests deploy integration-tests destroy})
  for stage in "${stages[@]}"; do
    stage_script="/opt/globalstack/stages/${stage_family}/${stage}.sh"
    if [ ! -x "${stage_script}" ]; then
      log "[ERROR] Missing executable stage script: ${stage_script}"
      exit 1
    fi
    log "Running stage: ${stage}"
    if ! "${stage_script}"; then
      log "[ERROR] Stage failed: ${stage}"
      exit 1
    fi
  done
  log "${PLATFORM_ID} lifecycle completed."
  exit 0
else
  log "local-only scope selected, skipping GlobalStack readiness wait."
fi

log "Tool versions:"
command -v az >/dev/null 2>&1 && az version --output json | head -40 || true
command -v terraform >/dev/null 2>&1 && terraform version || true
command -v tofu >/dev/null 2>&1 && tofu version || true
command -v pulumi >/dev/null 2>&1 && pulumi version || true
command -v ansible-playbook >/dev/null 2>&1 && ansible-playbook --version | head -5 || true

log "Runner smoke completed."
exit 0
