import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-lifecycle-captures');
const outRoot = join(root, 'fixtures', 'local-expectations');

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

function bodyShape(body) {
  if (body === null || body === undefined) return { kind: 'empty' };
  if (Array.isArray(body?.value)) return { kind: 'list', length: body.value.length };
  return {
    kind: 'resource',
    hasId: typeof body.id === 'string',
    type: body.type ?? null,
    provisioningState: body.properties?.provisioningState ?? null,
  };
}

const entries = await readdir(fixtureRoot).catch(() => []);
const expectations = [];
for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
  if (fixture.globalstack?.validationDepth !== 'live-lifecycle') continue;
  if (!fixture.cleanup?.verifiedDeleted) continue;
  for (const step of fixture.steps) {
    expectations.push({
      id: `${fixture.id}.${step.id}`,
      fixtureId: fixture.id,
      stepId: step.id,
      description: step.description,
      request: {
        method: step.method,
        path: step.path,
        body: step.body ?? null,
      },
      expected: {
        status: step.response?.status,
        errorCode: errorCode(step.response?.body),
        bodyShape: bodyShape(step.response?.body),
      },
    });
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  source: 'fixtures/azure-lifecycle-captures',
  expectationCount: expectations.length,
  expectations,
};

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'azure-lifecycle-local-expectations.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Rendered ${expectations.length} Azure lifecycle local expectations`);
