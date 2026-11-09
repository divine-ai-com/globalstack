import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const roleList = /(@(?:Request|Resource)\[Microsoft\.Authorization\/roleAssignments:RoleDefinitionId\]\s+ForAnyOfAnyValues:GuidEquals\s+)\{([^}]+)\}/gi;

function canonicalCondition(condition) {
  let lists = 0;
  const canonical = condition.replace(roleList, (_whole, prefix, values) => {
    lists++;
    const roles = values.split(',').map(value => value.trim().toLowerCase());
    assert.ok(roles.every(value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)), 'Invalid delegated role ID');
    assert.equal(new Set(roles).size, roles.length, 'Duplicate delegated role ID');
    return `${prefix}{${roles.sort().join(',')}}`;
  });
  assert.equal(lists, 2, 'Delegation must constrain both role assignment writes and deletes');
  return canonical.replace(/\s+/g, '').toLowerCase();
}

export async function assertDocumentDelegation(condition) {
  assert.equal(typeof condition, 'string', 'Pilot delegation condition is missing');
  const catalog = JSON.parse(await readFile(new URL('./document-role-catalog.json', import.meta.url)));
  const template = await readFile(new URL('./workload-delegation.condition', import.meta.url), 'utf8');
  const expected = template.replaceAll('__ROLE_IDS__', catalog.roles.map(role => role.id).join(', '));
  assert.equal(canonicalCondition(condition), canonicalCondition(expected),
    'Pilot delegation does not match the documented workload roles and service-principal restriction');
}
