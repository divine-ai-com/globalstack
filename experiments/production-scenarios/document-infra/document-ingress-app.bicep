param serviceName string
param location string
param runId string
param environmentId string
param imageReference string
param registryHost string
param applicationSettings array
param publicIngress bool = false

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: '${serviceName}-ingress'
}

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: '${serviceName}-ingress'
  location: location
  tags: { project: 'globalstack-production-scenarios', run: runId }
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identity.id}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registryHost, identity: identity.id }]
      ingress: { external: publicIngress, targetPort: 8080, transport: 'http', allowInsecure: false }
    }
    template: {
      containers: [{
        name: 'document-ingress'
        image: imageReference
        resources: { cpu: 1, memory: '2Gi' }
        env: concat([
          { name: 'PORT', value: '8080' }
          { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        ], applicationSettings)
        probes: [
          { type: 'Startup', httpGet: { path: '/health', port: 8080 }, periodSeconds: 3, timeoutSeconds: 2, failureThreshold: 60 }
          { type: 'Readiness', httpGet: { path: '/health', port: 8080 }, periodSeconds: 5, timeoutSeconds: 2, failureThreshold: 3 }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output hostname string = app.properties.configuration.ingress.fqdn
output ingressId string = app.id
