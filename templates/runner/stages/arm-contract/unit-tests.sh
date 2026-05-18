#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/arm-contract/common.sh

log_stage unit-tests "checking deployment hygiene"
resource_group="$(resource_group_name)"
if [[ ! "${resource_group}" =~ ^rg- ]]; then
  write_stage_report unit-tests FAIL "resourceGroupName must start with rg-"
  exit 1
fi

jq -e '.parameters.location.value // "eastus" | strings' "${PLATFORM_PARAMETERS}" >/dev/null
write_stage_report unit-tests PASS "Deployment contract passed local unit checks"
