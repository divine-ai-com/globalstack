import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { test } from 'node:test';

const root = workspaceRoot(import.meta.url);
const requiredDocs = [
  'docs/README.md',
  'docs/START-HERE.md',
  'docs/CONFORMANCE-MODEL.md',
  'docs/ARCHITECTURE.md',
  'docs/SERVICE-SCOPE.md',
  'docs/AGENT-RUNBOOK.md',
  'docs/ARTIFACT-REGISTRY.md',
  'docs/REPO-MAP.md',
];
const generatedDocs = [
  'docs/SERVICE-SCOPE.md',
  'docs/REPO-MAP.md',
  'docs/ARTIFACT-REGISTRY.md',
];

function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return existsSync(join(root, relativePath));
}

function execNode(script) {
  return new Promise((resolve, reject) => {
    execFile('node', [script], { cwd: root }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${script} failed\n${stdout}${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function docsPathFromCodeSpan(value) {
  if (!value.startsWith('docs/')) return null;
  const normalized = normalize(value);
  if (normalized.startsWith('..')) return null;
  return normalized;
}

test('root README points agents at the docs routing index and required navigation docs', async () => {
  const rootReadme = await read('README.md');
  for (const doc of requiredDocs) {
    assert.match(rootReadme, new RegExp(doc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `README.md should reference ${doc}`);
  }
});

test('docs routing index lists required navigation docs and all routed paths exist', async () => {
  const docsReadme = await read('docs/README.md');
  for (const doc of requiredDocs.slice(1)) {
    const relativeToDocs = doc.replace(/^docs\//, '');
    assert.match(docsReadme, new RegExp(relativeToDocs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `docs/README.md should reference ${relativeToDocs}`);
  }

  const codeSpans = [...docsReadme.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const referencedDocs = codeSpans
    .map(docsPathFromCodeSpan)
    .filter(Boolean);
  for (const doc of referencedDocs) {
    assert.ok(exists(doc), `Referenced docs path should exist: ${doc}`);
  }
});

test('expected ADRs exist and are discoverable from the docs routing index', async () => {
  const docsReadme = await read('docs/README.md');
  assert.match(docsReadme, /docs\/decisions\//);

  const expectedAdrs = [
    'docs/decisions/0001-conformance-led-emulation.md',
    'docs/decisions/0002-localstack-azure-as-landscape-input.md',
    'docs/decisions/0003-captured-failures-can-be-local-passes.md',
    'docs/decisions/0004-parent-state-is-part-of-the-api-contract.md',
  ];
  for (const adr of expectedAdrs) {
    assert.ok(exists(adr), `Expected ADR should exist: ${adr}`);
  }
});

test('generated navigation docs are fresh', async () => {
  const before = new Map();
  for (const doc of generatedDocs) {
    before.set(doc, await read(doc));
  }

  try {
    await execNode('scripts/render/render-service-scope.mjs');
    await execNode('scripts/render/render-repo-map.mjs');
    await execNode('scripts/render/render-artifact-registry.mjs');

    for (const doc of generatedDocs) {
      const after = await read(doc);
      assert.equal(after, before.get(doc), `${doc} is stale; run npm run docs:nav`);
    }
  } finally {
    for (const [doc, content] of before.entries()) {
      await writeFile(join(root, doc), content);
    }
  }
});
