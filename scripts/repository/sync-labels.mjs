import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const labels = JSON.parse(await readFile(new URL('../../.github/labels.json', import.meta.url), 'utf8'));
const repository = process.env.GH_REPO ?? 'divine-ai-com/globalstack';
if (!process.argv.includes('--apply')) {
  console.log(`Would synchronize ${labels.length} labels in ${repository}. Pass --apply to update them.`);
  process.exit(0);
}
for (const label of labels) {
  execFileSync('gh', ['label', 'create', label.name, '--repo', repository, '--color', label.color, '--description', label.description, '--force'], { stdio: 'pipe' });
}
console.log(`Synchronized ${labels.length} labels in ${repository}. Existing unrelated labels were preserved.`);
