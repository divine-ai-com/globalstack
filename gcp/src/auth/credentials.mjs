import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

export const defaultEnvPath = '/home/ubuntu/secrets/gcp/env';
export const defaultCredentialsPath = '/home/ubuntu/secrets/gcp/globalstack-conformance-sa.json';
export const defaultAdcPath = `${process.env.HOME ?? '/home/ubuntu'}/.config/gcloud/application_default_credentials.json`;

const serviceAccountRequiredFields = ['type', 'project_id', 'private_key_id', 'private_key', 'client_email', 'token_uri'];
const authorizedUserRequiredFields = ['type', 'client_id', 'client_secret', 'refresh_token'];
const externalAccountRequiredFields = ['type', 'audience', 'subject_token_type', 'token_url'];
const impersonatedServiceAccountRequiredFields = ['type', 'service_account_impersonation_url', 'source_credentials'];

export async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function validateCredentials(credentials, sourcePath) {
  if (credentials.type === 'service_account') {
    const missing = serviceAccountRequiredFields.filter(field => !credentials[field]);
    if (missing.length > 0) throw new Error(`${sourcePath} is missing required service-account fields: ${missing.join(', ')}`);
    return;
  }
  if (credentials.type === 'authorized_user') {
    const missing = authorizedUserRequiredFields.filter(field => !credentials[field]);
    if (missing.length > 0) throw new Error(`${sourcePath} is missing required authorized-user ADC fields: ${missing.join(', ')}`);
    return;
  }
  if (credentials.type === 'external_account') {
    const missing = externalAccountRequiredFields.filter(field => !credentials[field]);
    if (missing.length > 0) throw new Error(`${sourcePath} is missing required external-account ADC fields: ${missing.join(', ')}`);
    return;
  }
  if (credentials.type === 'impersonated_service_account') {
    const missing = impersonatedServiceAccountRequiredFields.filter(field => !credentials[field]);
    if (missing.length > 0) throw new Error(`${sourcePath} is missing required impersonated-service-account ADC fields: ${missing.join(', ')}`);
    validateCredentials(credentials.source_credentials, `${sourcePath}.source_credentials`);
    return;
  }
  throw new Error(`${sourcePath} has unsupported credential type=${credentials.type}`);
}

export async function resolveCredentialsPath({ envPath = defaultEnvPath, credentialsPath = defaultCredentialsPath, preferAdc = false } = {}) {
  if (preferAdc) return defaultAdcPath;
  const envText = await readIfExists(envPath);
  if (!envText) {
    const explicitText = await readIfExists(credentialsPath);
    if (explicitText && !/^\s*[A-Z_]+=/.test(explicitText)) return credentialsPath;
    const adcText = await readIfExists(defaultAdcPath);
    return adcText ? defaultAdcPath : credentialsPath;
  }
  const env = parseEnv(envText);
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return env.GOOGLE_APPLICATION_CREDENTIALS;
  const explicitText = await readIfExists(credentialsPath);
  if (explicitText && !/^\s*[A-Z_]+=/.test(explicitText)) return credentialsPath;
  const adcText = await readIfExists(defaultAdcPath);
  return adcText ? defaultAdcPath : credentialsPath;
}

export async function loadCredentials(path) {
  const text = await readFile(path, 'utf8');
  if (/^\s*[A-Z_]+=/.test(text)) {
    throw new Error(`${path} looks like an env file, not a service-account JSON key. Put the JSON key at this path, or put env values in ${defaultEnvPath}.`);
  }
  const credentials = JSON.parse(text);
  validateCredentials(credentials, path);
  return credentials;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function signServiceAccountJwt(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: credentials.private_key_id,
  };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;
}

export async function requestServiceAccountAccessToken(credentials) {
  if (credentials.type !== 'service_account') {
    throw new Error('Direct token exchange is only supported for service_account JSON. For ADC credentials, use gcloud auth application-default print-access-token.');
  }
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signServiceAccountJwt(credentials),
  });
  const response = await fetch(credentials.token_uri, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Token request failed with status ${response.status}.`);
  }
  return json;
}

export function summarizeCredentials(credentials, credentialsPath) {
  return {
    credentials_path: credentialsPath,
    credential_type: credentials.type,
    project_id: credentials.project_id ?? credentials.quota_project_id ?? null,
    client_email: credentials.client_email ?? credentials.service_account_impersonation_url?.match(/serviceAccounts\/([^:]+):/)?.[1] ?? null,
    token_uri: credentials.token_uri ?? credentials.token_url ?? null,
    private_key_present: Boolean(credentials.private_key),
  };
}
