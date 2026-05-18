#!/usr/bin/env bash
set -euo pipefail

source /opt/globalstack/stages/bicep/common.sh

log_stage deploy "deploying compiled ARM template against provider=${PROVIDER:-${GLOBALSTACK_TARGET_PROVIDER}}"
request_local_token
token="$(local_access_token)"
if [ -z "${token}" ] || [ "${token}" = "null" ]; then
  write_stage_report deploy FAIL "local Azure token request did not return an access_token"
  exit 1
fi

jq -n \
  --slurpfile template "${BICEP_ARM_TEMPLATE}" \
  --slurpfile parameters "${BICEP_PARAMETERS}" \
  --arg location "${AZURE_LOCATION}" \
  '{
    location: $location,
    properties: {
      mode: "Incremental",
      template: $template[0],
      parameters: $parameters[0].parameters
    }
  }' > "${BICEP_DEPLOYMENT_BODY}"

deploy_url="${AZURE_ENDPOINT_URL%/}/subscriptions/${ARM_SUBSCRIPTION_ID}/providers/Microsoft.Resources/deployments/bicep-runner-smoke?api-version=2022-09-01"
az rest \
  --method put \
  --url "${deploy_url}" \
  --body "@${BICEP_DEPLOYMENT_BODY}" \
  --headers 'content-type=application/json' "Authorization=Bearer ${token}" \
  --skip-authorization-header \
  -o json > "${BICEP_DEPLOYMENT_RESPONSE}"

jq -e '.properties.provisioningState == "Succeeded"' "${BICEP_DEPLOYMENT_RESPONSE}" >/dev/null
jq -e '(.properties.globalstackDeploymentSteps | length) > 0' "${BICEP_DEPLOYMENT_RESPONSE}" >/dev/null
write_stage_report deploy PASS "Bicep deployment succeeded"
