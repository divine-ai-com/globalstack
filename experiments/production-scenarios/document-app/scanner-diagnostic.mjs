import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DefaultAzureCredential } from '@azure/identity';

// This opt-in, host-admin-authenticated endpoint is a component diagnostic.
// It does not stand in for the Event Grid or Durable application workflow.
export function createScannerDiagnostic({ env = process.env, credential, fetchImpl = fetch } = {}) {
  const endpoint = new URL(env.SCANNER_ENDPOINT);
  assert.ok(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/');
  assert.match(env.SCANNER_SCOPE ?? '', /^api:\/\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/\.default$/i);
  assert.match(env.AZURE_CLIENT_ID ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  const identity = credential ?? new DefaultAzureCredential({ managedIdentityClientId: env.AZURE_CLIENT_ID });
  return async request => {
    let input;
    try { input = await request.json(); } catch { return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } }; }
    if (typeof input?.text !== 'string' || !input.text.length) return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } };
    const bytes = Buffer.from(input.text);
    if (bytes.length > 4096) return { status: 413, jsonBody: { error: 'DiagnosticInputTooLarge' } };
    const correlationId = randomUUID(), inputSha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      const token = await identity.getToken(env.SCANNER_SCOPE);
      const response = await fetchImpl(new URL('/scan', endpoint), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { authorization: `Bearer ${token.token}`, 'content-type': 'text/plain', 'x-correlation-id': correlationId }, body: bytes });
      const chunks = []; let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.length; assert.ok(size <= 1024 * 1024, 'Scanner response exceeded diagnostic bound'); chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString();
      return { status: response.status, jsonBody: { correlationId, inputSha256, upstreamStatus: response.status, scan: text ? JSON.parse(text) : null } };
    } catch { return { status: 502, jsonBody: { correlationId, inputSha256, error: 'ScannerDiagnosticFailed' } }; }
  };
}
