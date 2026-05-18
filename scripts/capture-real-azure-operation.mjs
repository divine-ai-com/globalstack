import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const enabled = process.env.GLOBALSTACK_REAL_AZURE_CAPTURE === '1';

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function sanitizeHeaders(headers = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('token') || lower.includes('key')) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function sanitizeBody(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeBody);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (lower.includes('secret') || lower.includes('password') || lower.includes('key') || lower.includes('token')) {
        result[key] = '<redacted>';
      } else {
        result[key] = sanitizeBody(nested);
      }
    }
    return result;
  }
  return value;
}

function usage() {
  console.error([
    'Usage:',
    '  GLOBALSTACK_REAL_AZURE_CAPTURE=1 node scripts/capture-real-azure-operation.mjs <fixture-id> <request-json>',
    '',
    'request-json shape:',
    '  { "method": "PUT", "url": "https://management.azure.com/...", "body": {...} }',
    '',
    'The script uses `az rest` and writes sanitized fixtures under fixtures/azure-captures/.',
  ].join('\n'));
}

const [, , fixtureId, requestPath] = process.argv;
if (!fixtureId || !requestPath) {
  usage();
  process.exit(2);
}

if (!enabled) {
  console.error('Real Azure capture is disabled. Set GLOBALSTACK_REAL_AZURE_CAPTURE=1 to provision/call Azure intentionally.');
  process.exit(3);
}

const raw = await readFile(requestPath, 'utf8');
const spec = JSON.parse(raw);
if (!spec.method || !spec.url) {
  throw new Error('request-json must include method and url');
}

const args = ['rest', '--method', spec.method, '--url', spec.url, '--headers', 'Content-Type=application/json'];
if (spec.body !== undefined) args.push('--body', JSON.stringify(spec.body));

const startedAt = new Date().toISOString();
const result = await run('az', args);
const endedAt = new Date().toISOString();

let responseBody = result.stdout;
try {
  responseBody = result.stdout ? JSON.parse(result.stdout) : null;
} catch {
  responseBody = result.stdout;
}

const fixture = {
  id: fixtureId,
  capturedAt: endedAt,
  tool: 'az rest',
  request: {
    method: spec.method,
    url: spec.url.replace(/subscriptions\/[^/]+/i, 'subscriptions/<subscription-id>'),
    body: sanitizeBody(spec.body),
  },
  response: {
    exitCode: result.code,
    body: sanitizeBody(responseBody),
    stderr: result.stderr.replace(/Bearer [A-Za-z0-9._-]+/g, 'Bearer <redacted>'),
    headers: sanitizeHeaders(spec.expectedHeaders ?? {}),
  },
  timing: {
    startedAt,
    endedAt,
  },
  globalstack: {
    use: 'Normalize this fixture into a conformance test before marking the operation cloudValidated.',
  },
};

await mkdir(fixtureRoot, { recursive: true });
await writeFile(join(fixtureRoot, `${fixtureId}.json`), `${JSON.stringify(fixture, null, 2)}\n`);

console.log(`Wrote sanitized Azure capture fixture ${join(fixtureRoot, `${fixtureId}.json`)}`);
process.exit(result.code === 0 ? 0 : 10);
