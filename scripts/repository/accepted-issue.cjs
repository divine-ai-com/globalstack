// Run only from the default branch. Contributor code must never receive this token.
const acceptedLabel = 'accepted';

function issueNumbers(body = '') {
  const clean = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/```[\s\S]*?```/g, ' ');
  return [...new Set([...clean.matchAll(/^Accepted issue:\s*#([1-9]\d*)\s*$/gm)].map(match => Number(match[1])))];
}

async function isAdministrator(github, repo, login) {
  if (login === 'deavgprime') return true;
  if (!login) return false;
  try {
    const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ ...repo, username: login });
    return data.permission === 'admin';
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function evaluate(github, repo, pr) {
  if (await isAdministrator(github, repo, pr.user.login)) {
    return { state: 'success', description: 'Repository administrator: issue acceptance is optional.' };
  }
  const numbers = issueNumbers(pr.body ?? '');
  if (numbers.length !== 1) {
    return { state: 'failure', description: 'Add one line to the PR body: Accepted issue: #123.' };
  }
  let issue;
  try {
    ({ data: issue } = await github.rest.issues.get({ ...repo, issue_number: numbers[0] }));
  } catch (error) {
    if (error.status !== 404) throw error;
    return { state: 'failure', description: 'The linked issue does not exist in this repository.' };
  }
  if (issue.pull_request || issue.state !== 'open' || !issue.labels.some(label => label.name === acceptedLabel)) {
    return { state: 'failure', description: 'The linked issue must be open and labeled accepted.' };
  }
  const events = await github.paginate(github.rest.issues.listEvents, { ...repo, issue_number: issue.number, per_page: 100 });
  const lastLabelEvent = events.filter(event => ['labeled', 'unlabeled'].includes(event.event) && event.label?.name === acceptedLabel).at(-1);
  if (lastLabelEvent?.event !== 'labeled' || !await isAdministrator(github, repo, lastLabelEvent.actor?.login)) {
    return { state: 'failure', description: 'The accepted label must be applied by a repository administrator.' };
  }
  return { state: 'success', description: `Issue #${issue.number} was accepted by a repository administrator.` };
}

async function run({ github, context, core }) {
  const repo = context.repo;
  // Re-read current metadata, including for queued label events, to avoid stale decisions.
  const prs = context.payload.pull_request
    ? [(await github.rest.pulls.get({ ...repo, pull_number: context.payload.pull_request.number })).data]
    : await github.paginate(github.rest.pulls.list, { ...repo, state: 'open', base: 'main', per_page: 100 });
  for (const pr of prs) {
    if (pr.state !== 'open' || pr.base.ref !== 'main') continue;
    let result;
    try { result = await evaluate(github, repo, pr); }
    catch (error) {
      core.error(`Could not verify acceptance for PR #${pr.number}: ${error.message}`);
      result = { state: 'error', description: 'Unable to verify issue acceptance. A maintainer must rerun this workflow.' };
    }
    await github.rest.repos.createCommitStatus({ ...repo, sha: pr.head.sha, context: 'Accepted issue', ...result });
  }
}
module.exports = { issueNumbers, isAdministrator, evaluate, run };
