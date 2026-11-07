// Azure Search Management 2025-05-01 service-name contract. Used before mutation
// and by ARM preflight so the same invalid name cannot pass through another route.
export function validateSearchServiceName(name) {
  if (typeof name === 'string' && /^(?=.{2,60}$)[a-z0-9][a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return null;
  return {
    code: 'InvalidServiceName',
    message: `Service name '${name}' is invalid: Service name must only contain lowercase letters, digits or dashes, cannot start or end with or contain consecutive dashes and is limited to 60 characters.`,
  };
}
