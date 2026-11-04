#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

log_stage unit-tests "checking deterministic deployment hygiene"
resource_group="$(resource_group_name)"
if [[ ! "${resource_group}" =~ ^rg- ]]; then
  write_stage_report unit-tests FAIL "resourceGroupName must start with rg-"
  exit 1
fi

if ! jq -e --arg location "${AZURE_LOCATION}" '.parameters.location.value == $location or .parameters.location.value == null' "${BICEP_PARAMETERS}" >/dev/null; then
  write_stage_report unit-tests FAIL "location parameter must match AZURE_LOCATION when provided"
  exit 1
fi

run_task_stage_command unit-tests
write_stage_report unit-tests PASS "Bicep task passed local unit checks"
