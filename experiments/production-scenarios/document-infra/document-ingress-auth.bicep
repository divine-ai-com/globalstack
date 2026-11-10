param ingressName string
param tenantId string
param apiAudience string
param allowedClientId string
param allowedPrincipalId string

resource ingress 'Microsoft.App/containerApps@2025-01-01' existing = { name: ingressName }

resource authentication 'Microsoft.App/containerApps/authConfigs@2025-01-01' = {
  parent: ingress
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: { unauthenticatedClientAction: 'Return401' }
    httpSettings: { requireHttps: true }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: apiAudience
          openIdIssuer: uri(environment().authentication.loginEndpoint, '${tenantId}/v2.0')
        }
        validation: {
          allowedAudiences: [apiAudience, 'api://${apiAudience}']
          defaultAuthorizationPolicy: {
            allowedApplications: [allowedClientId]
            allowedPrincipals: { identities: [allowedPrincipalId] }
          }
          jwtClaimChecks: { allowedClientApplications: [allowedClientId] }
        }
      }
    }
  }
}

output authenticationId string = authentication.id
