import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { assertDocumentDelegation } from './delegation-check.mjs';

const catalog = JSON.parse(await readFile(new URL('./document-role-catalog.json', import.meta.url)));
const template = await readFile(new URL('./workload-delegation.condition', import.meta.url), 'utf8');
const complete = template.replaceAll('__ROLE_IDS__', catalog.roles.map(role => role.id).join(', '));

test('delegation preflight accepts the complete condition regardless of role order', async () => {
  await assertDocumentDelegation(complete);
  const reordered = complete.replaceAll(catalog.roles.map(role => role.id).join(', '),
    catalog.roles.map(role => role.id).reverse().join(', '));
  await assertDocumentDelegation(reordered);
});

test('delegation preflight rejects the missing Search reader before a paid run', async () => {
  const withoutReader = complete.replaceAll(`, ${catalog.roles.find(role => role.name === 'Storage Blob Data Reader').id}`, '');
  await assert.rejects(assertDocumentDelegation(withoutReader), /does not match/);
});

test('delegation preflight rejects an altered service-principal restriction', async () => {
  await assert.rejects(assertDocumentDelegation(complete.replaceAll('ServicePrincipal', 'User')),
    /does not match/);
});
