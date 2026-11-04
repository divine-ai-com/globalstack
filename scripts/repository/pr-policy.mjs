import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const types = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert', 'style'];
export const scopes = ['arm', 'runtime', 'storage', 'conformance', 'runners', 'bundles', 'docs', 'deps', 'ci', 'release'];

export function validatePullRequest({ title = '', body = '', head = '' }) {
  const errors = [];
  const match = title.match(/^([a-z]+)(?:\(([a-z-]+)\))?(!)?: ([a-z0-9].*)$/);
  if (!match || !types.includes(match[1]) || (match[2] && !scopes.includes(match[2]))) {
    errors.push('Use a Conventional Commit title, for example fix(arm): reject invalid resource tags.');
  }
  if (title.length > 72) errors.push('Keep the title at 72 characters or fewer.');
  if (/[.\s]$/.test(title) || title.includes('\u2014')) errors.push('The title must not end with a period or whitespace, or contain an em dash.');
  if (head && !/^(?:feat|fix|perf|refactor|docs|test|build|ci|chore|revert|style|release|hotfix|codex)\/[a-z0-9][a-z0-9._-]*$/.test(head)
    && !/^dependabot\/[a-z0-9_./-]+$/.test(head)) {
    errors.push('Use a topic branch such as fix/request-validation.');
  }
  const cleanBody = body.replace(/<!--[\s\S]*?-->/g, '');
  for (const heading of ['Why', 'What changed', 'How it was tested']) {
    const section = cleanBody.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1]?.trim();
    if (!section || !/[a-zA-Z0-9]/.test(section)) errors.push(`Fill in the "${heading}" section.`);
  }
  if (match?.[3] && !/^## Breaking changes\s*\n\s*\S/m.test(cleanBody)) {
    errors.push('Add a Breaking changes section explaining the migration.');
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const errors = validatePullRequest({ title: pr.title, body: pr.body ?? '', head: pr.head.ref });
  for (const error of errors) console.error(error);
  process.exitCode = errors.length ? 1 : 0;
}
