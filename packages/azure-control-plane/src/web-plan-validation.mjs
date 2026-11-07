import { appServiceError, envelopedError } from './provider-validation-support.mjs';

// Plan metadata support does not provide compute, scaling, quota or network isolation.
export function validateWebPlan(body) {
  const sku = body.sku ?? {};
  if (typeof sku.name === 'string' && !/^(F1|D1|B[1-3]|S[1-3]|P[1-3]|P[0-5]m?v[234]|EP[1-3]|I[1-6](m?v2)?|Y1|FC1|WS[1-3])$/i.test(sku.name)) {
    const result = appServiceError(400, 'BadRequest', 'The parameter SKU.Name has an invalid value.');
    result.body.Details.push({ ErrorEntity: { MessageTemplate: 'The parameter {0} has an invalid value.',
      Parameters: ['SKU.Name'], Code: 'BadRequest', Message: result.body.Message } });
    return result;
  }
  const p = body.properties ?? {};
  const supported = (sku.name === 'P0v3' && ['PremiumV3', 'Premium0V3'].includes(sku.tier) && body.kind === 'linux'
      || sku.name === 'EP1' && sku.tier === 'ElasticPremium' && body.kind === 'elastic')
    && p.reserved === true && sku.capacity === 1
    && [undefined, false].includes(p.zoneRedundant) && [undefined, false].includes(p.perSiteScaling)
    && [undefined, 1].includes(p.maximumElasticWorkerCount)
    && [undefined, sku.name === 'EP1'].includes(p.elasticScaleEnabled)
    && Object.keys(p).every(key => ['reserved', 'zoneRedundant', 'perSiteScaling', 'maximumElasticWorkerCount', 'elasticScaleEnabled'].includes(key));
  if (!supported) return envelopedError(501, 'GlobalStackUnsupportedAppServicePlan',
    'Supported local plan metadata is Y1 Dynamic, or single-instance Linux P0v3/EP1 without zones or per-site scaling. Other configurations are not implemented.');
  return null;
}
