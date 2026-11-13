import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';

test('pilot delegation includes every built-in role requested by document templates', async () => {
  const catalog = JSON.parse(await readFile(new URL('./document-role-catalog.json', import.meta.url)));
  const allowed = new Set(catalog.roles.map(role => role.id.toLowerCase()));
  assert.equal(allowed.size, catalog.roles.length, 'Delegated roles must be unique');

  const directory = new URL('../document-infra/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.bicep'))) {
    const source = await readFile(new URL(file, directory), 'utf8');
    for (const [roleId] of source.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi)) {
      assert.ok(allowed.has(roleId.toLowerCase()), `${file} requests a role outside the pilot delegation: ${roleId}`);
    }
  }
});
