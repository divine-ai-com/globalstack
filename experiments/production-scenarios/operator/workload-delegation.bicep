targetScope = 'resourceGroup'

@description('Object ID of the certificate-authenticated pilot service principal, not its application/client ID.')
@minLength(36)
@maxLength(36)
param pilotPrincipalId string

var delegatedRoles = loadJsonContent('document-role-catalog.json').roles
var roleIds = join(map(delegatedRoles, role => role.id), ', ')
// Public built-in role ID. The condition excludes administrative role grants.
var delegationRole = 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'

resource delegation 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, pilotPrincipalId, 'globalstack-document-workload-delegation')
  properties: {
    principalId: pilotPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', delegationRole)
    description: 'Temporary document-pilot delegation, limited to listed workload roles and service principals in this group.'
    conditionVersion: '2.0'
    condition: replace(loadTextContent('workload-delegation.condition'), '__ROLE_IDS__', roleIds)
  }
}

output delegationId string = delegation.id
