import {
  defaultAdcPath,
  defaultCredentialsPath,
  defaultEnvPath,
  loadCredentials,
  requestServiceAccountAccessToken,
  resolveCredentialsPath,
  summarizeCredentials,
} from '../src/auth/credentials.mjs';

function parseArgs(argv) {
  const args = {
    envPath: process.env.GLOBALSTACK_GCP_ENV_PATH ?? defaultEnvPath,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? defaultCredentialsPath,
    requestToken: false,
    preferAdc: false,
  };
  for (const arg of argv) {
    if (arg === '--token') {
      args.requestToken = true;
      continue;
    }
    if (arg === '--adc') {
      args.preferAdc = true;
      args.credentialsPath = defaultAdcPath;
      continue;
    }
    if (arg.startsWith('--env=')) {
      args.envPath = arg.slice('--env='.length);
      continue;
    }
    if (arg.startsWith('--credentials=')) {
      args.credentialsPath = arg.slice('--credentials='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const credentialsPath = await resolveCredentialsPath(args);
const credentials = await loadCredentials(credentialsPath);
const result = summarizeCredentials(credentials, credentialsPath);

if (args.requestToken) {
  const token = await requestServiceAccountAccessToken(credentials);
  result.token_request = {
    ok: Boolean(token.access_token),
    token_type: token.token_type ?? null,
    expires_in: token.expires_in ?? null,
  };
}

console.log(JSON.stringify(result, null, 2));
