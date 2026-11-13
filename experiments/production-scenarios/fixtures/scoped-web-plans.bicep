param serviceName string
param location string
param runId string

resource ingress 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: '${serviceName}-ingress'
  location: location
  tags: {
    project: 'globalstack-production-scenarios'
    run: runId
  }
  kind: 'linux'
  sku: {
    name: 'P0v3'
    tier: 'PremiumV3'
    capacity: 1
  }
  properties: {
    reserved: true
    perSiteScaling: false
    elasticScaleEnabled: false
  }
}

resource worker 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: '${serviceName}-worker'
  location: location
  tags: {
    project: 'globalstack-production-scenarios'
    run: runId
  }
  kind: 'elastic'
  sku: {
    name: 'EP1'
    tier: 'ElasticPremium'
    capacity: 1
  }
  properties: {
    reserved: true
    maximumElasticWorkerCount: 1
  }
}
