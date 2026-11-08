// Captured Azure preflight behavior: the reference's word "none" means no
// configured destination, not the literal string accepted by the old facade.
export function validateContainerEnvironment(body) {
  if (body?.properties?.appLogsConfiguration?.destination !== 'none') return null;
  return { code: 'InvalidRequestParameterWithDetails',
    message: "AppLogsConfiguration.Destination is invalid.  App Logs destination 'none' not supported. Supported values: 'log-analytics', 'azure-monitor' or none" };
}
