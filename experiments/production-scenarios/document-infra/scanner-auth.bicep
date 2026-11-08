param runId string = ''
param scannerName string
param tenantId string
param scannerAudience string
param workerIdentityName string

resource scanner 'Microsoft.App/containerApps@2025-01-01' existing = { name: scannerName }
resource worker 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: workerIdentityName }

// The audience has no app roles. Restrict both the client and principal to the
// deployed worker so another application cannot use its own valid token here.
resource authentication 'Microsoft.App/containerApps/authConfigs@2025-01-01' = {
  parent: scanner
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: { unauthenticatedClientAction: 'Return401' }
    httpSettings: { requireHttps: true }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: scannerAudience
          openIdIssuer: uri(environment().authentication.loginEndpoint, '${tenantId}/v2.0')
        }
        validation: {
          allowedAudiences: [scannerAudience]
          defaultAuthorizationPolicy: {
            allowedApplications: [worker.properties.clientId]
            allowedPrincipals: { identities: [worker.properties.principalId] }
          }
          jwtClaimChecks: { allowedClientApplications: [worker.properties.clientId] }
        }
      }
    }
  }
}

output authenticationId string = authentication.id

output evidenceRunId string = runId
