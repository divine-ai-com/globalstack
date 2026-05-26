import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'docs', 'conformance');
const checklistPath = join(outRoot, 'azure-99-parity-checklist.json');
const outJsonPath = join(outRoot, 'azure-99-roadmap.json');
const outMdPath = join(outRoot, 'azure-99-roadmap.md');
const distRoot = join(root, 'dist', 'e2e');
const complexBundleSummaryPath = join(root, 'dist', 'complex-pulumi-bundles', 'latest-results.json');

const waveDefinitions = [
  {
    id: 'wave-1-official-emulator-and-storage-family',
    label: 'Wave 1: official emulator and storage-family depth',
    serviceIds: [
      'blob-storage',
      'queue-storage',
      'cosmos-nosql-table',
      'azure-files',
      'service-bus-topics',
      'event-grid',
      'event-hubs-streams',
      'app-configuration-parameters',
    ],
    objective: 'Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.',
  },
  {
    id: 'wave-2-identity-security-and-secrets',
    label: 'Wave 2: identity, security, secrets, and encryption',
    serviceIds: [
      'identity-rbac',
      'key-vault-secrets',
      'key-vault-keys',
      'waf-policy',
      'activity-log-audit',
    ],
    objective: 'Make authorization, denial, audit, and secure configuration behavior credible across the emulator.',
  },
  {
    id: 'wave-3-compute-api-and-edge',
    label: 'Wave 3: compute, API, containers, and edge routing',
    serviceIds: [
      'azure-functions',
      'api-management',
      'container-registry',
      'aks-metadata',
      'logic-workflows',
      'load-balancing',
      'front-door-cdn',
      'service-discovery',
    ],
    objective: 'Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.',
  },
  {
    id: 'wave-4-data-platforms',
    label: 'Wave 4: relational, cache, migration, and analytics platforms',
    serviceIds: [
      'postgresql-flexible-server',
      'mysql-flexible-server',
      'redis-cache',
      'synapse-warehouse',
      'database-migration-service',
    ],
    objective: 'Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.',
  },
  {
    id: 'wave-5-networking-observability-and-dns',
    label: 'Wave 5: networking, DNS, and observability',
    serviceIds: [
      'virtual-network',
      'monitor-logs',
      'monitor-metrics-alerts',
      'dns-zones',
    ],
    objective: 'Harden cross-cutting dependencies that most other services reference during deployment.',
  },
];

const dimensionWeights = {
  liveApiSurfaceInventory: 10,
  parameterVarianceCaptures: 12,
  stateTransitionCaptures: 14,
  errorShapeFidelity: 12,
  identityRbacBehavior: 12,
  retryEventualConsistency: 10,
  iacProviderBehavior: 16,
  dataPlaneBehavior: 14,
  ambiguousRepeatCaptures: 6,
  serviceSpecificFacade: 16,
};

const dimensionCommands = {
  liveApiSurfaceInventory: [
    'npm run providers:surface',
    'npm run conformance:catalog',
  ],
  parameterVarianceCaptures: [
    'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --limit=0',
    'npm run conformance:classify && npm run conformance:expectations',
  ],
  stateTransitionCaptures: [
    'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
    'npm run conformance:classify && npm run conformance:expectations',
  ],
  errorShapeFidelity: [
    'npm run conformance:local -- --capability=<service>',
  ],
  identityRbacBehavior: [
    'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true',
  ],
  retryEventualConsistency: [
    'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
  ],
  iacProviderBehavior: [
    'npm run smoke:prompts',
    'npm run smoke:deploy',
  ],
  dataPlaneBehavior: [],
  ambiguousRepeatCaptures: [],
  serviceSpecificFacade: [
    'npm run conformance:local -- --capability=<service>',
    'npm run smoke',
  ],
};

const crossCuttingBacklog = [
  {
    id: 'live-azure-capture-expansion',
    label: 'More live Azure capture expansion per service',
    detail: 'Turn candidate control-plane and data-plane calls into cleanup-verified real Azure fixtures for every high-value service surface.',
    commands: [
      'npm run providers:surface',
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
      'npm run conformance:classify && npm run conformance:expectations',
    ],
  },
  {
    id: 'service-specific-parameter-variance',
    label: 'More parameter variance beyond generic invalid/missing cases',
    detail: 'Add service-specific invalid names, parent references, enum values, mutually-exclusive fields, range checks, and schema-shape captures before normalizing local behavior.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --limit=0',
      'npm run conformance:classify && npm run conformance:expectations',
    ],
  },
  {
    id: 'provider-lifecycle-depth',
    label: 'Provider refresh, diff/preview, update, import, drift, and destroy semantics',
    detail: 'Extend each platform runner beyond create/destroy smoke so generated IaC behaves the same way against GlobalStack as it does against Azure provider tooling.',
    commands: [
      'npm run smoke:prompts',
      'npm run smoke:deploy',
      'GLOBALSTACK_AUTH_TOKEN=globalstack-local-token PIPELINE_STAGE_SCOPE=full npm run smoke:platform-runners',
    ],
  },
  {
    id: 'error-shape-header-fidelity',
    label: 'Exact error-shape and header fidelity',
    detail: 'Match Azure status codes, error codes, body structure, async-operation headers, retry headers, and request-id shaped responses for captured cases.',
    commands: [
      'npm run conformance:local -- --capability=<service>',
      'npm run conformance:classify && npm run conformance:expectations',
    ],
  },
  {
    id: 'retry-and-eventual-consistency',
    label: 'Retry and eventual-consistency behavior',
    detail: 'Capture poll cadence, transitional states, delayed reads, delete lag, and retryable failures before claiming timing fidelity.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
      'npm run conformance:classify && npm run conformance:expectations',
    ],
  },
  {
    id: 'rbac-and-authorization',
    label: 'RBAC and authorization behavior',
    detail: 'Expand allow/deny matrices for ARM and service data planes, including propagation lag and inherited-scope behavior where Azure actually enforces it.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true',
      'npm run conformance:local -- --capability=identity-rbac',
    ],
  },
  {
    id: 'timing-sensitive-repeat-captures',
    label: 'Repeat captures for timing-sensitive behavior',
    detail: 'Re-capture ambiguous or unstable Azure behavior before encoding it into local expectations, especially delete/read races and async completion windows.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
      'npm run conformance:classify && npm run conformance:expectations',
    ],
  },
  {
    id: 'deeper-service-data-planes',
    label: 'Deeper service-specific data planes where applicable',
    detail: 'Broaden bounded local facades and official-emulator integrations for services such as Cosmos, Files, Event Hubs, App Configuration, Key Vault, PostgreSQL, MySQL, and Redis.',
    commands: [
      'npm run hybrid:render',
      'npm run smoke',
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
    ],
  },
  {
    id: 'adversarial-new-task-waves',
    label: 'Adversarial new task waves',
    detail: 'Keep generating new ultra-expert Azure IaC bundles that were not explicitly optimized for the current parity set, then run them through the shipment lifecycle and treat the first surviving mismatch as the next engineering target.',
    commands: [
      'OPENAI_MODEL=gpt-5.5 node scripts/verified/run-openai-azure-complex-pulumi-bundles.mjs',
      'npm run shipment:export -- --po-id=<po-id> --pr-id=<Pr...>',
    ],
  },
  {
    id: 'real-azure-differential-reruns',
    label: 'Real-Azure differential reruns',
    detail: 'Re-run the same deployment and inspection flows against real Azure and GlobalStack so the parity claim is continuously challenged instead of frozen at one historical capture set.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
      'npm run conformance:classify && npm run conformance:expectations',
    ],
  },
  {
    id: 'conformance-runner-completion-determinism',
    label: 'Conformance runner completion determinism',
    detail: 'Harden the real-Azure conformance runner so it exits deterministically after capture and cleanup. Some scoped reruns still write fresh fixtures and then go quiet instead of finishing cleanly.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
      'npm run conformance:classify && npm run conformance:expectations',
      'npm run validate',
    ],
  },
  {
    id: 'timing-and-drift-checks',
    label: 'Repeated timing and drift checks',
    detail: 'Keep rerunning timing-sensitive delete/read, async polling, and propagation windows so eventual-consistency assumptions stay tied to current Azure behavior instead of stale fixtures.',
    commands: [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true',
      'npm run conformance:parity && npm run conformance:roadmap',
    ],
  },
  {
    id: 'mismatch-to-product-gap',
    label: 'Treat every surviving mismatch as a product gap',
    detail: 'Classify each new failure as bundle-generation defect, provider defect, or emulator/runtime parity defect, then convert every true Azure mismatch into an explicit product work item instead of a one-off workaround.',
    commands: [
      'npm run validate',
      'git diff --check',
    ],
  },
];

function statusScore(status) {
  if (status === 'complete') return 1;
  if (status === 'partial') return 0.45;
  return 0;
}

function estimateStatusScore(status) {
  if (status === 'complete') return 1;
  if (status === 'partial') return 0.55;
  return 0.05;
}

function serviceScore(service) {
  let earned = 0;
  let total = 0;
  for (const [dimensionId, item] of Object.entries(service.dimensions)) {
    const weight = dimensionWeights[dimensionId] ?? 10;
    total += weight;
    earned += weight * statusScore(item.status);
  }
  return total === 0 ? 0 : Number((earned / total).toFixed(4));
}

function priorityFor(service, waveIndex) {
  const score = serviceScore(service);
  const tierBoost = service.tier === 1 ? 20 : 8;
  const waveBoost = Math.max(0, 20 - waveIndex * 3);
  const providerSize = Math.min(12, Math.ceil((service.evidence.providerOperationCount ?? 0) / 100));
  const notStartedPenalty = service.dimensionCounts.notStarted * 5;
  return Math.round(tierBoost + waveBoost + providerSize + notStartedPenalty + (1 - score) * 100);
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function round1(value) {
  return Number(value.toFixed(1));
}

function displayRange(percent) {
  const upper = Math.ceil(percent / 5) * 5;
  const lower = Math.max(0, upper - 5);
  return `${lower}-${upper}%`;
}

function serviceEstimateBase(service) {
  const dimensionIds = Object.keys(service.dimensions);
  if (dimensionIds.length === 0) return 0;
  const total = dimensionIds.reduce((sum, dimensionId) => sum + estimateStatusScore(service.dimensions[dimensionId].status), 0);
  return (total / dimensionIds.length) * 100;
}

function serviceEstimateBonus(service, parityEvidence) {
  let bonus = 0;
  if (service.dimensions.serviceSpecificFacade?.status !== 'not-started') bonus += 5;
  if (service.dimensions.iacProviderBehavior?.status !== 'not-started') bonus += 5;
  if (service.dimensions.dataPlaneBehavior?.status !== 'not-started') bonus += 5;
  if (parityEvidence?.platformOk === true) bonus += 5;
  return bonus;
}

function serviceEstimate(service, parityEvidence = null) {
  return Math.min(99, round1(serviceEstimateBase(service) + serviceEstimateBonus(service, parityEvidence)));
}

async function loadStressVerificationSnapshot() {
  try {
    const raw = JSON.parse(await readFile(complexBundleSummaryPath, 'utf8'));
    const results = (raw.results ?? []).map((result) => ({
      prId: result.prId,
      scenarioId: result.scenarioId,
      overallStatus: result.run?.report?.overall_status ?? 'UNKNOWN',
      finalStage: result.run?.report?.final_stage ?? 'unknown',
    }));
    return {
      source: 'dist/complex-pulumi-bundles/latest-results.json',
      generatedAt: raw.generatedAt ?? null,
      total: results.length,
      passCount: results.filter((item) => item.overallStatus === 'PASS').length,
      results,
    };
  } catch {
    return null;
  }
}

function programEstimate(services) {
  if (services.length === 0) return 0;
  const total = services.reduce((sum, service) => sum + serviceEstimateBase(service), 0);
  return round1(total / services.length);
}

function dataPlaneCommandsFor(serviceId) {
  const emulatorCompose = 'dist/hybrid/docker-compose.official-emulators.yml';
  const profileByService = {
    'blob-storage': 'azurite',
    'queue-storage': 'azurite',
    'cosmos-nosql-table': 'cosmos-db-emulator',
    'service-bus-topics': 'service-bus-emulator',
    'event-hubs-streams': 'event-hubs-emulator',
    'app-configuration-parameters': 'app-configuration-emulator',
    'postgresql-flexible-server': 'local-postgres',
    'mysql-flexible-server': 'local-mysql',
    'redis-cache': 'local-redis',
    'container-registry': 'local-oci-registry',
  };
  if (['blob-storage', 'queue-storage'].includes(serviceId)) {
    return [
      'npm run e2e:storage-hardening',
      'npm run e2e:storage-normalizer',
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane',
      'npm run storage:expectations',
    ];
  }
  const profile = profileByService[serviceId];
  if (profile) {
    return [
      'npm run hybrid:render',
      `docker compose -f ${emulatorCompose} --profile ${profile} up -d`,
      `docker compose -f ${emulatorCompose} --profile ${profile} down -v`,
    ];
  }
  return [
    'npm run hybrid:render',
    `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=${serviceId} --all=true`,
  ];
}

function ambiguousCaptureCommandsFor(serviceId) {
  if (['blob-storage', 'queue-storage'].includes(serviceId)) {
    return [
      'GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane',
      'npm run storage:expectations',
    ];
  }
  return [
    `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=${serviceId} --all=true`,
    'npm run conformance:classify && npm run conformance:expectations',
  ];
}

function commandsFor(dimensionId, serviceId) {
  if (dimensionId === 'dataPlaneBehavior') return dataPlaneCommandsFor(serviceId);
  if (dimensionId === 'ambiguousRepeatCaptures') return ambiguousCaptureCommandsFor(serviceId);
  return (dimensionCommands[dimensionId] ?? ['npm run conformance:parity'])
    .map(command => command.replaceAll('<service>', serviceId));
}

function workItemFor(service, dimensionId, dimension) {
  const item = service.dimensions[dimensionId];
  const action = item.status === 'not-started'
    ? 'start'
    : item.status === 'partial'
      ? 'complete'
      : 'verify';
  return {
    id: `${service.capabilityId}.${dimensionId}`,
    serviceId: service.capabilityId,
    dimensionId,
    dimension: dimension.label,
    status: item.status,
    action,
    evidence: item.evidence,
    gaps: item.gaps,
    commands: commandsFor(dimensionId, service.capabilityId),
    acceptanceGate: dimension.doneWhen,
  };
}

function summarizeWorkItems(workItems) {
  const byAction = {};
  const byDimension = {};
  for (const item of workItems) {
    byAction[item.action] = (byAction[item.action] ?? 0) + 1;
    byDimension[item.dimensionId] = (byDimension[item.dimensionId] ?? 0) + 1;
  }
  return { byAction, byDimension };
}

function markdown(doc) {
  const lines = [
    '# Azure 99% Coverage Roadmap',
    '',
    'This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.',
    '',
    `Generated: ${doc._meta.generatedAt}`,
    '',
    '## Guardrails',
    '',
    '- Every real Azure run must be explicitly gated and followed by cleanup verification.',
    '- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.',
    '- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.',
    '- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.',
    '',
    '## Dynamic Estimate Snapshot',
    '',
    `- Overall 30-service Azure program: ${doc.estimateSnapshot.overall.percent}% (${doc.estimateSnapshot.overall.displayRange})`,
    `- Azure Functions / Durable cluster: ${doc.estimateSnapshot.azureFunctionsDurable.percent}% (${doc.estimateSnapshot.azureFunctionsDurable.displayRange})`,
    `- Azure Logic Apps cluster: ${doc.estimateSnapshot.logicWorkflows.percent}% (${doc.estimateSnapshot.logicWorkflows.displayRange})`,
    '',
    'Method:',
    '- Overall program estimate is derived from roadmap status only: `complete = 100%`, `partial = 55%`, `not-started = 5%`, averaged across all services and dimensions.',
    '- Service cluster estimates start from the same status-derived base, then add bounded evidence bonuses for a started local facade, started provider behavior, started data-plane behavior, and a passing parity pack with full platform matrix when present.',
    '',
  ];

  if (doc.stressVerificationSnapshot) {
    lines.push(
      '## Stress Verification Snapshot',
      '',
      `- Source: \`${doc.stressVerificationSnapshot.source}\``,
      `- Generated: ${doc.stressVerificationSnapshot.generatedAt ?? 'unknown'}`,
      `- Bundles in latest adversarial wave: ${doc.stressVerificationSnapshot.total}`,
      `- Passing bundles in latest adversarial wave: ${doc.stressVerificationSnapshot.passCount}/${doc.stressVerificationSnapshot.total}`,
      '',
      '| Bundle | Scenario | Overall | Final Stage |',
      '|---|---|---|---|',
    );

    for (const result of doc.stressVerificationSnapshot.results) {
      lines.push(`| ${result.prId} | ${result.scenarioId} | ${result.overallStatus} | ${result.finalStage} |`);
    }

    lines.push('');
  }

  lines.push(
    '## Cross-Cutting Pending Backlog',
    '',
    'These items remain open across the whole Azure program even when a service-specific parity pack is green.',
    '',
    '| Pending Item | Why It Is Still Pending | Default Commands |',
    '|---|---|---|',
  );

  for (const item of doc.crossCuttingBacklog) {
    lines.push(`| ${item.label} | ${item.detail} | ${item.commands.map(command => `\`${command}\``).join('<br>')} |`);
  }

  lines.push(
    '',
    '## Wave Summary',
    '',
    '| Wave | Services | Work Items | Objective |',
    '|---|---:|---:|---|',
  );

  for (const wave of doc.waves) {
    lines.push(`| ${wave.label} | ${wave.services.length} | ${wave.workItemCount} | ${wave.objective} |`);
  }

  lines.push('');
  lines.push('## Service Priority');
  lines.push('');
  lines.push('| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |');
  lines.push('|---:|---|---:|---|---:|---:|---:|---:|---:|---|');
  for (const item of doc.prioritizedServices) {
    lines.push(`| ${item.rank} | ${item.serviceId} | ${item.tier} | ${item.waveId} | ${item.score} | ${item.priority} | ${item.dimensionCounts.complete} | ${item.dimensionCounts.partial} | ${item.dimensionCounts.notStarted} | ${item.nextDimensions.join('<br>')} |`);
  }

  for (const wave of doc.waves) {
    lines.push('');
    lines.push(`## ${wave.label}`);
    lines.push('');
    lines.push(wave.objective);
    lines.push('');
    for (const service of wave.services) {
      lines.push(`### ${service.serviceId}`);
      lines.push('');
      lines.push(`Priority: ${service.priority}; current score: ${service.score}; current status: ${service.currentStatus}.`);
      lines.push('');
      lines.push('| Work Item | Status | Action | Commands | Acceptance Gate |');
      lines.push('|---|---|---|---|---|');
      for (const item of service.workItems.slice(0, 10)) {
        lines.push(`| ${item.dimension} | ${item.status} | ${item.action} | ${item.commands.map(command => `\`${command}\``).join('<br>')} | ${item.acceptanceGate} |`);
      }
      lines.push('');
    }
  }

  lines.push('## Verification Loop');
  lines.push('');
  lines.push('After each service batch:');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run conformance:classify');
  lines.push('npm run conformance:expectations');
  lines.push('npm run conformance:parity');
  lines.push('npm run conformance:roadmap');
  lines.push('npm run validate');
  lines.push('npm run smoke');
  lines.push('az group list --query "[?starts_with(name, \'rg-gs-\') || starts_with(name, \'globalstack-\')].name" -o json');
  lines.push('```');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

const checklist = JSON.parse(await readFile(checklistPath, 'utf8'));
const functionsParity = await readJsonIfExists(join(distRoot, 'azure-functions-parity', 'results.json'));
const logicParity = await readJsonIfExists(join(distRoot, 'azure-logic-workflows-parity', 'results.json'));
const serviceById = new Map(checklist.services.map(service => [service.capabilityId, service]));
const dimensions = new Map(checklist.dimensions.map(dimension => [dimension.id, dimension]));
const seenServices = new Set();

const waves = waveDefinitions.map((wave, waveIndex) => {
  const services = wave.serviceIds.map(serviceId => {
    const service = serviceById.get(serviceId);
    if (!service) throw new Error(`Roadmap wave references unknown service ${serviceId}`);
    seenServices.add(serviceId);
    const workItems = Object.entries(service.dimensions)
      .filter(([, item]) => item.status !== 'complete')
      .map(([dimensionId]) => workItemFor(service, dimensionId, dimensions.get(dimensionId)))
      .sort((a, b) => (dimensionWeights[b.dimensionId] ?? 0) - (dimensionWeights[a.dimensionId] ?? 0));
    const score = serviceScore(service);
    return {
      serviceId,
      tier: service.tier,
      awsAnalogue: service.awsAnalogue,
      azureEquivalent: service.azureEquivalent,
      currentStatus: service.currentStatus,
      dimensionCounts: service.dimensionCounts,
      score,
      priority: priorityFor(service, waveIndex),
      workItemCount: workItems.length,
      nextDimensions: workItems.slice(0, 4).map(item => item.dimensionId),
      workItems,
    };
  }).sort((a, b) => b.priority - a.priority);

  return {
    id: wave.id,
    label: wave.label,
    objective: wave.objective,
    services,
    workItemCount: services.reduce((sum, service) => sum + service.workItemCount, 0),
  };
});

const missingServices = checklist.services
  .filter(service => !seenServices.has(service.capabilityId))
  .map(service => service.capabilityId);
if (missingServices.length > 0) {
  throw new Error(`Roadmap is missing services: ${missingServices.join(', ')}`);
}

const allWorkItems = waves.flatMap(wave => wave.services.flatMap(service => service.workItems));
const overallEstimatePercent = programEstimate(checklist.services);
const azureFunctionsService = serviceById.get('azure-functions');
const logicWorkflowsService = serviceById.get('logic-workflows');
const functionsParityEvidence = functionsParity
  ? {
      total: functionsParity.controlAndDataPlane?.total ?? 0,
      platformOk: functionsParity.platformMatrix?.ok === true,
    }
  : null;
const logicParityEvidence = logicParity
  ? {
      total: logicParity.controlPlane?.total ?? 0,
      platformOk: logicParity.platformMatrix?.ok === true,
    }
  : null;
const stressVerificationSnapshot = await loadStressVerificationSnapshot();
const azureFunctionsEstimatePercent = azureFunctionsService ? serviceEstimate(azureFunctionsService, functionsParityEvidence) : null;
const logicWorkflowsEstimatePercent = logicWorkflowsService ? serviceEstimate(logicWorkflowsService, logicParityEvidence) : null;
const prioritizedServices = waves
  .flatMap(wave => wave.services.map(service => ({
    rank: 0,
    waveId: wave.id,
    serviceId: service.serviceId,
    tier: service.tier,
    score: service.score,
    priority: service.priority,
    dimensionCounts: service.dimensionCounts,
    nextDimensions: service.nextDimensions,
  })))
  .sort((a, b) => b.priority - a.priority)
  .map((service, index) => ({ ...service, rank: index + 1 }));

const doc = {
  _meta: {
    generatedAt: new Date().toISOString(),
    generatedBy: 'npm run conformance:roadmap',
    source: 'docs/conformance/azure-99-parity-checklist.json',
    serviceCount: checklist.services.length,
    waveCount: waves.length,
    workItemCount: allWorkItems.length,
    policy: 'Roadmap is execution order only; parity claims still require checklist dimensions to be complete.',
  },
  estimateSnapshot: {
    overall: {
      percent: overallEstimatePercent,
      displayRange: displayRange(overallEstimatePercent),
      methodology: 'status-derived average across all services and dimensions',
    },
    azureFunctionsDurable: {
      percent: azureFunctionsEstimatePercent,
      displayRange: displayRange(azureFunctionsEstimatePercent),
      methodology: 'status-derived base plus bounded evidence bonuses from local facade, provider behavior, data-plane status, and green parity pack',
      evidence: functionsParityEvidence,
    },
    logicWorkflows: {
      percent: logicWorkflowsEstimatePercent,
      displayRange: displayRange(logicWorkflowsEstimatePercent),
      methodology: 'status-derived base plus bounded evidence bonuses from local facade, provider behavior, data-plane status, and green parity pack',
      evidence: logicParityEvidence,
    },
  },
  stressVerificationSnapshot,
  crossCuttingBacklog,
  waves,
  prioritizedServices,
  workItemSummary: summarizeWorkItems(allWorkItems),
};

await mkdir(outRoot, { recursive: true });
await writeFile(outJsonPath, `${JSON.stringify(doc, null, 2)}\n`);
await writeFile(outMdPath, markdown(doc));

console.log(`Rendered Azure 99% roadmap with ${doc._meta.workItemCount} work items across ${doc._meta.waveCount} waves`);
