#!/usr/bin/env bash
set -euo pipefail
resource_url="https://management.azure.com/subscriptions/${ARM_SUBSCRIPTION_ID}/resourcegroups/${GROUP_NAME}?api-version=2021-04-01"
case "${1:-present}" in
  present)
    jq -n --arg location "$LOCATION" --arg run "$RUN_ID" --arg expires "$EXPIRES" --arg revision "$REVISION" '{location:$location,tags:{project:"globalstack-paired-lifecycle",run:$run,expires:$expires,revision:$revision}}' > /private/group-body.json
    az rest --method put --url "$resource_url" --body @/private/group-body.json --skip-authorization-header --headers "Authorization=Bearer ${AZURE_ACCESS_TOKEN}" --output json
    ;;
  read) az rest --method get --url "$resource_url" --skip-authorization-header --headers "Authorization=Bearer ${AZURE_ACCESS_TOKEN}" --output json ;;
  absent) az rest --method delete --url "$resource_url" --skip-authorization-header --headers "Authorization=Bearer ${AZURE_ACCESS_TOKEN}" --output json ;;
  *) exit 2 ;;
esac
