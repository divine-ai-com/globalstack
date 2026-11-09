param serviceName string
param location string
param runId string

var tags = { project: 'globalstack-production-scenarios', run: runId }

resource worker 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-worker'
  location: location
  tags: tags
}

resource ingress 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-ingress'
  location: location
  tags: tags
}

output workerPrincipalId string = worker.properties.principalId
output ingressPrincipalId string = ingress.properties.principalId
