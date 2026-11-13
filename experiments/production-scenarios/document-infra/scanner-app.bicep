param serviceName string
param location string
param runId string
param environmentId string
param imageReference string
param registryHost string
param publicIngress bool = false

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: '${serviceName}-scanner' }
resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: '${serviceName}-scanner'
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
        name: 'scanner'
        image: imageReference
        resources: { cpu: 2, memory: '4Gi' }
        env: [{ name: 'PORT', value: '8080' }]
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
output scannerId string = app.id
