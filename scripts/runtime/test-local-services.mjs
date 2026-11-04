import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// These packs use in-process local runtimes. Native platform checks run separately.
for (const service of ['key-vault', 'event-grid', 'logic-workflows']) {
  const result = spawnSync(process.execPath, [`scripts/e2e/e2e-azure-${service}-parity.mjs`, '--skip-platforms'], {
    cwd: root, stdio: 'inherit', timeout: 120000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
