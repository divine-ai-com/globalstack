// ARM can keep a parent deployment Running while a provider has already failed.
// Preserve that provider response and stop this bounded experiment promptly.
export function throttledDeploymentOperation(operations) {
  for (const operation of operations?.value ?? []) {
    let status = operation.properties?.statusMessage;
    if (typeof status === 'string') {
      try { status = JSON.parse(status); } catch { continue; }
    }
    if (!status || typeof status !== 'object') continue;
    const error = status.error ?? status;
    if (['429', 'TooManyRequests'].includes(String(error.code))) return operation;
  }
  return null;
}
