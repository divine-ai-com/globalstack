#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

log_stage lint "validating task structure"
jq -e '.parameters.resourceGroupName.value | strings | length > 0' "${BICEP_PARAMETERS}" >/dev/null
jq -e '.resources | arrays | length > 0' "${BICEP_ARM_TEMPLATE}" >/dev/null
write_stage_report lint PASS "Bicep parameters and compiled template are structurally valid"
