export const shallowAzureErrorCodes = new Set([
  'MissingSubscriptionRegistration',
  'NoRegisteredProviderFound',
  'InvalidResourceNamespace',
  'InvalidResourceType',
]);

export const armSurfaceErrorCodes = new Set([
  'MissingApiVersionParameter',
  'ResourceGroupNotFound',
]);

export const captureInfrastructureErrorCodes = new Set([
  'SubscriptionNotFound',
]);

export function azureError(fixture) {
  const body = fixture?.response?.body;
  if (body?.error) return body.error;
  if (body?.code || body?.message) return body;
  return null;
}

export function classifyAzureCapture(fixture) {
  const error = azureError(fixture);
  const code = error?.code ?? null;
  const message = error?.message ?? '';
  const status = fixture?.response?.status;
  if (code === 'NamespaceInTransition' || /cannot be completed without additional quota/i.test(message)) {
    return {
      depth: 'capture-infrastructure-gap',
      cloudValidated: false,
      providerRegistered: null,
      caveat: 'Parent provisioning or capture-subscription quota blocked the request before its parameters could be validated.',
    };
  }
  if (captureInfrastructureErrorCodes.has(code) || /specified subscription .* does not exist/i.test(message)) {
    return {
      depth: 'capture-infrastructure-gap',
      cloudValidated: false,
      providerRegistered: null,
      caveat: 'The capture did not validate service behavior because the request targeted a subscription scope Azure rejected before provider semantics.',
    };
  }
  if (shallowAzureErrorCodes.has(code)) {
    return {
      depth: 'subscription-or-provider-readiness',
      cloudValidated: false,
      providerRegistered: false,
      caveat: 'The request did not reach deep provider validation because subscription/provider readiness blocked it.',
    };
  }
  if (armSurfaceErrorCodes.has(code)) {
    return {
      depth: 'arm-surface',
      cloudValidated: false,
      providerRegistered: null,
      caveat: 'This validates Azure Resource Manager surface behavior, not service-specific provider semantics.',
    };
  }
  if (status === 404 && ['ParentResourceNotFound', 'ResourceNotFound'].includes(code)) {
    return {
      depth: 'provider-routing-or-parent-validation',
      cloudValidated: false,
      providerRegistered: null,
      caveat: 'This validates provider routing or parent-resource behavior only; it does not prove successful resource provisioning.',
    };
  }
  if (status >= 200 && status < 300) {
    return {
      depth: 'provider-accepted',
      cloudValidated: false,
      providerRegistered: true,
      caveat: 'Provider accepted the request shape in this subscription; local parity still requires normalized expectation tests.',
    };
  }
  return {
    depth: 'provider-validation',
    cloudValidated: false,
    providerRegistered: true,
    caveat: 'Provider returned a validation response that can be normalized into local emulator behavior.',
  };
}
