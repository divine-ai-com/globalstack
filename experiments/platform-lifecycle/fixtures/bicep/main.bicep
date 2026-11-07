targetScope = 'subscription'
param groupName string
param location string
param runId string
param expires string
param revision string
resource group 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: groupName
  location: location
  tags: {
    project: 'globalstack-paired-lifecycle'
    run: runId
    expires: expires
    revision: revision
  }
}
output groupId string = group.id
