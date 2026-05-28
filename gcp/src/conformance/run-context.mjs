import { randomBytes } from 'node:crypto';
import { defaultEnvPath, parseEnv, readIfExists } from '../auth/credentials.mjs';

export const conformanceLabels = Object.freeze({
  purpose: 'globalstack-conformance',
  owner: 'globalstack',
});

export async function createRunContext({
  envPath = process.env.GLOBALSTACK_GCP_ENV_PATH ?? defaultEnvPath,
  projectId,
  location,
  service,
  runId = createRunId(service),
  bucketLocation,
} = {}) {
  const envText = await readIfExists(envPath);
  const env = envText ? parseEnv(envText) : {};
  const resolvedProjectId = projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? env.GOOGLE_CLOUD_PROJECT;
  if (!resolvedProjectId) {
    throw new Error('Missing GOOGLE_CLOUD_PROJECT. Set it in the environment or /home/ubuntu/secrets/gcp/env.');
  }
  const resolvedLocation = location ?? process.env.GOOGLE_CLOUD_LOCATION ?? env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
  return {
    project_id: resolvedProjectId,
    location: resolvedLocation,
    bucket_location: bucketLocation ?? process.env.GOOGLE_CLOUD_STORAGE_LOCATION ?? env.GOOGLE_CLOUD_STORAGE_LOCATION ?? 'US',
    service: service ?? 'unknown',
    run_id: runId,
    labels: {
      ...conformanceLabels,
      run_id: normalizeLabelValue(runId),
    },
    started_at: new Date().toISOString(),
  };
}

export function createRunId(service = 'gcp') {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${service.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${timestamp}-${randomBytes(3).toString('hex')}`;
}

export function normalizeLabelValue(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function createResourceName({ prefix, runId, maxLength = 63 }) {
  const normalized = `${prefix}-${runId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.slice(0, maxLength).replace(/-+$/g, '');
}
