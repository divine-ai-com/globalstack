#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/arm-contract/common.sh

log_stage lint "validating ARM deployment contract"
jq -e '.resources | arrays | length > 0' "${PLATFORM_TEMPLATE}" >/dev/null
jq -e '.parameters.resourceGroupName.value | strings | length > 0' "${PLATFORM_PARAMETERS}" >/dev/null
write_stage_report lint PASS "ARM deployment contract is structurally valid"
