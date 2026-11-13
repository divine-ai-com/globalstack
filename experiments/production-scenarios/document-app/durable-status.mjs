// The pinned durable-functions client throws for a missing instance, while the
// host status endpoint represents that absence with HTTP 404.
export async function existingOrchestrationStatus(client, instanceId) {
  try { return await client.getStatus(instanceId); }
  catch (error) {
    const message = String(error?.message ?? '');
    if (message.startsWith('DurableClient error: Durable Functions extension replied with HTTP 404 response.')
      && message.includes(`instanceId provided: ${instanceId}.`)) return null;
    throw error;
  }
}
