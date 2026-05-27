import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  loadCredentials,
  parseEnv,
  resolveCredentialsPath,
  validateCredentials,
} from '../../src/auth/credentials.mjs';

test('parseEnv reads shell-style key value files without treating comments as data', () => {
  assert.deepEqual(parseEnv(`
    # GlobalStack GCP conformance
    GOOGLE_CLOUD_PROJECT=globalstack-conformance-runner
    GOOGLE_CLOUD_LOCATION="europe-north2"
  `), {
    GOOGLE_CLOUD_PROJECT: 'globalstack-conformance-runner',
    GOOGLE_CLOUD_LOCATION: 'europe-north2',
  });
});

test('validateCredentials accepts common ADC credential shapes', () => {
  validateCredentials({
    type: 'authorized_user',
    client_id: 'client-id',
    client_secret: 'client-secret',
    refresh_token: 'refresh-token',
  }, 'adc.json');

  validateCredentials({
    type: 'impersonated_service_account',
    service_account_impersonation_url: 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/example@example.iam.gserviceaccount.com:generateAccessToken',
    source_credentials: {
      type: 'authorized_user',
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
    },
  }, 'impersonated-adc.json');
});

test('loadCredentials rejects env-like files at JSON credential paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-'));
  try {
    const path = join(dir, 'credentials.json');
    await writeFile(path, 'GOOGLE_CLOUD_PROJECT=globalstack-conformance-runner\n');
    await assert.rejects(() => loadCredentials(path), /looks like an env file/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('resolveCredentialsPath falls back to ADC when env has no explicit credential path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'globalstack-gcp-'));
  try {
    const envPath = join(dir, 'env');
    const defaultCredentialPath = join(dir, 'missing-service-account.json');
    await writeFile(envPath, 'GOOGLE_CLOUD_PROJECT=globalstack-conformance-runner\n');

    const resolved = await resolveCredentialsPath({
      envPath,
      credentialsPath: defaultCredentialPath,
    });

    assert.match(resolved, /application_default_credentials\.json$|missing-service-account\.json$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
