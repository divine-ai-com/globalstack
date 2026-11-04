import { test } from 'node:test';
import { runCrossServiceFlow } from '../../../scripts/e2e/cross-service-flows.mjs';

for (const scenario of ['vault-enrichment', 'event-routing']) {
  test(`cross-service flow with broken-wiring controls: ${scenario}`, { timeout: 30000 }, async () => {
    await runCrossServiceFlow(scenario);
  });
}
