#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/arm-contract/common.sh

log_stage build "copying task and running native platform checks"
copy_task_to_workdir

if [ ! -f "${PLATFORM_TEMPLATE}" ] || [ ! -f "${PLATFORM_PARAMETERS}" ]; then
  write_stage_report build FAIL "missing globalstack ARM contract files"
  exit 1
fi

native_check
jq type "${PLATFORM_TEMPLATE}" >/dev/null
jq type "${PLATFORM_PARAMETERS}" >/dev/null
write_stage_report build PASS "Native platform check and ARM contract build passed"
