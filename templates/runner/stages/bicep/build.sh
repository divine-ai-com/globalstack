#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

log_stage build "copying task and compiling Bicep"
copy_task_to_workdir

if [ ! -f "${BICEP_MAIN}" ]; then
  write_stage_report build FAIL "missing lib/main.bicep"
  exit 1
fi

if [ ! -f "${BICEP_PARAMETERS}" ]; then
  write_stage_report build FAIL "missing lib/parameters.json"
  exit 1
fi

az bicep build --file "${BICEP_MAIN}" --outfile "${BICEP_ARM_TEMPLATE}"
jq type "${BICEP_ARM_TEMPLATE}" >/dev/null
write_stage_report build PASS "Bicep compiled to ARM JSON"
