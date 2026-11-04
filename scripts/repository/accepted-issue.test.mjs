import test from 'node:test';
import assert from 'node:assert/strict';
import policy from './accepted-issue.cjs';
const repo = { owner: 'example', repo: 'project' };
function api({ admin = false, actor = 'maintainer', labeled = true, state = 'open', pull = false } = {}) {
  return {
    rest: {
      repos: { getCollaboratorPermissionLevel: async ({ username }) => ({ data: { permission: admin || username === 'maintainer' ? 'admin' : 'read' } }) },
      issues: { get: async () => ({ data: { number: 12, state, pull_request: pull || undefined, labels: labeled ? [{ name: 'accepted' }] : [] } }), listEvents() {} },
    },
    paginate: async () => [{ event: 'labeled', label: { name: 'accepted' }, actor: { login: actor } }],
  };
}
const pr = { user: { login: 'contributor' }, body: 'Accepted issue: #12' };
test('accepts the owner and current admins without issues', async () => {
  assert.equal((await policy.evaluate(api(), repo, { user: { login: 'deavgprime' } })).state, 'success');
  assert.equal((await policy.evaluate(api({ admin: true }), repo, { user: { login: 'another-admin' } })).state, 'success');
});
test('requires a real open issue accepted by an administrator', async () => {
  assert.equal((await policy.evaluate(api(), repo, pr)).state, 'success');
  for (const options of [{ actor: 'contributor' }, { labeled: false }, { state: 'closed' }, { pull: true }]) {
    assert.equal((await policy.evaluate(api(options), repo, pr)).state, 'failure');
  }
  assert.equal((await policy.evaluate(api(), repo, { ...pr, body: '' })).state, 'failure');
});
test('ignores commented or fenced references and rejects multiple issues', async () => {
  assert.deepEqual(policy.issueNumbers('<!--\nAccepted issue: #12\n-->\n```\nAccepted issue: #13\n```'), []);
  assert.equal((await policy.evaluate(api(), repo, { ...pr, body: 'Accepted issue: #12\nAccepted issue: #13' })).state, 'failure');
});
test('a later unlabel event revokes acceptance', async () => {
  const github = api();
  github.paginate = async () => [{ event: 'labeled', label: { name: 'accepted' }, actor: { login: 'maintainer' } }, { event: 'unlabeled', label: { name: 'accepted' } }];
  assert.equal((await policy.evaluate(github, repo, pr)).state, 'failure');
});
