import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const productsUrl = 'https://cloud.google.com/products';
const localgcpUrl = 'https://localgcp.com/';
const outPath = join(root, 'gcp', 'docs', 'emulators', 'coverage.json');

const officialEmulatorCoverage = [
  {
    names: ['Firestore'],
    url: 'https://cloud.google.com/firestore',
    docUrl: 'https://cloud.google.com/datastore/docs/emulator',
    notes: [
      'Official Google Cloud local emulator is provided through the Firestore emulator in Datastore mode and the Firestore emulator tooling.',
    ],
  },
  {
    names: ['Datastore mode', 'Datastore', 'Firestore in Datastore mode'],
    url: 'https://cloud.google.com/datastore',
    docUrl: 'https://cloud.google.com/datastore/docs/emulator',
    notes: [
      'Official Google Cloud local emulator path is Datastore mode via the Firestore emulator or the legacy Datastore emulator.',
    ],
  },
  {
    names: ['Pub/Sub', 'Cloud Pub/Sub'],
    url: 'https://cloud.google.com/pubsub',
    docUrl: 'https://cloud.google.com/pubsub/docs/emulator',
    notes: [
      'Official Google Cloud local emulator is provided through the Pub/Sub emulator.',
    ],
  },
  {
    names: ['Bigtable'],
    url: 'https://cloud.google.com/bigtable',
    docUrl: 'https://cloud.google.com/bigtable/docs/emulator',
    notes: [
      'Official Google Cloud local emulator is provided through the Bigtable emulator.',
    ],
  },
  {
    names: ['Spanner'],
    url: 'https://cloud.google.com/spanner',
    docUrl: 'https://cloud.google.com/spanner/docs/emulator',
    notes: [
      'Official Google Cloud local emulator is provided through the Spanner emulator.',
    ],
  },
];

const localgcpCoverage = [
  {
    names: ['Vertex AI', 'Vertex AI Platform'],
    url: 'https://cloud.google.com/vertex-ai',
    notes: [
      'REST surface on :8090.',
      'generateContent and embeddings are proxied through Ollama or run in stub mode.',
    ],
  },
  {
    names: ['BigQuery'],
    url: 'https://cloud.google.com/bigquery',
    notes: [
      'REST surface on :9060.',
      'DuckDB-backed BigQuery emulation.',
    ],
  },
  {
    names: ['Spanner'],
    url: 'https://cloud.google.com/spanner',
    notes: [
      'Official Google emulator is orchestrated through Docker on demand.',
    ],
  },
  {
    names: ['Bigtable'],
    url: 'https://cloud.google.com/bigtable',
    notes: [
      'Official Google emulator is orchestrated through Docker on demand.',
    ],
  },
  {
    names: ['Firestore'],
    url: 'https://cloud.google.com/firestore',
    notes: [
      'gRPC surface on :8088.',
      'Document CRUD, listeners, queries, and transactions.',
    ],
  },
  {
    names: ['Pub/Sub', 'Cloud Pub/Sub'],
    url: 'https://cloud.google.com/pubsub',
    notes: [
      'gRPC surface on :8085.',
      'Topics, subscriptions, publish, pull, StreamingPull, push subscriptions, and dead-letter topics.',
    ],
  },
  {
    names: ['Cloud Storage'],
    url: 'https://cloud.google.com/storage',
    notes: [
      'REST surface on :4443.',
      'Bucket and object CRUD, simple or multipart or resumable uploads, signed URLs, and JSON/XML API paths.',
    ],
  },
  {
    names: ['Cloud SQL'],
    url: 'https://cloud.google.com/sql',
    notes: [
      'PostgreSQL 16 is orchestrated through Docker on :5432.',
    ],
  },
  {
    names: ['Memorystore'],
    url: 'https://cloud.google.com/memorystore',
    notes: [
      'Redis 7 is orchestrated through Docker on :6379.',
    ],
  },
  {
    names: ['Cloud Tasks'],
    url: 'https://cloud.google.com/tasks/docs',
    notes: [
      'gRPC surface on :8089.',
      'Queue and task CRUD, HTTP target dispatch, scheduling, and retry with exponential backoff.',
    ],
  },
  {
    names: ['Cloud Key Management', 'Cloud KMS'],
    url: 'https://cloud.google.com/security/products/security-key-management',
    notes: [
      'gRPC surface on :8091.',
      'Encrypt/decrypt, asymmetric sign, HMAC, and key management.',
    ],
  },
  {
    names: ['Secret Manager'],
    url: 'https://cloud.google.com/secret-manager',
    notes: [
      'gRPC surface on :8086.',
      'Secrets with versioning and latest alias access.',
    ],
  },
  {
    names: ['Cloud Run'],
    url: 'https://cloud.google.com/run',
    notes: [
      'Docker-backed runtime surfaced on :8093.',
    ],
  },
  {
    names: ['Cloud Logging'],
    url: 'https://cloud.google.com/logging',
    notes: [
      'gRPC surface on :8092.',
      'Write and query log entries.',
    ],
  },
];

const manualCatalogEntries = [
  {
    name: 'Vertex AI',
    url: 'https://cloud.google.com/vertex-ai',
    description: 'Unified platform for ML models and generative AI.',
    source: 'manual-supplement',
  },
  {
    name: 'Secret Manager',
    url: 'https://cloud.google.com/secret-manager',
    description: 'Securely store, manage, and access secrets and secret versions.',
    source: 'manual-supplement',
  },
  {
    name: 'Cloud Key Management',
    url: 'https://cloud.google.com/security/products/security-key-management',
    description: 'Manage encryption keys on Google Cloud.',
    source: 'manual-supplement',
  },
  {
    name: 'Cloud Logging',
    url: 'https://cloud.google.com/logging',
    description: 'Google Cloud audit, platform, and application logs management.',
    source: 'manual-supplement',
  },
  {
    name: 'Datastore mode',
    url: 'https://cloud.google.com/datastore',
    description: 'Firestore in Datastore mode compatibility surface.',
    source: 'manual-supplement',
  },
];

const canonicalNameOverrides = new Map([
  ['https://cloud.google.com/pubsub', 'Pub/Sub'],
  ['https://cloud.google.com/stackdriver', 'Operations Suite'],
  ['https://cloud.google.com/products/gemini-enterprise-agent-platform', 'Gemini Enterprise Agent Platform'],
]);

const rejectedNames = new Set([
  'Why Google Cloud',
  'Executive insights',
  'Industry Solutions',
  'Data Cloud',
  'Data Analytics',
  'Databases',
  'Google Cloud Databases',
  'Business Intelligence',
  'Infrastructure',
  'Security',
  'Startups and SMB',
  'Management tools',
  'Storage products',
  'Compute products',
  'Serverless computing',
  'Solutions',
  'Learning Hub',
  'Google Cloud Free Program',
  'Cloud console',
  'Customer Care',
]);

const rejectedPathPrefixes = [
  '/solutions',
  '/use-cases',
  '/architecture',
  '/startup',
  '/gov',
  '/edu',
  '/learn',
  '/free',
  '/home',
  '/events',
  '/support',
  '/why-google-cloud',
  '/data-cloud',
];

const rejectedPathSegments = new Set(['pricing', 'faq', 'resources', 'compliance']);

const curatedIacRuntimeInventory = [
  { service_key: 'compute-engine', category: 'compute', priority: 'tier1' },
  { service_key: 'google-kubernetes-engine', category: 'compute', priority: 'tier1' },
  { service_key: 'cloud-run', category: 'compute', priority: 'tier1' },
  { service_key: 'cloud-functions', category: 'compute', priority: 'tier1' },
  { service_key: 'app-engine', category: 'compute', priority: 'tier2' },
  { service_key: 'batch', category: 'compute', priority: 'tier2' },
  { service_key: 'cloud-storage', category: 'storage', priority: 'tier1' },
  { service_key: 'filestore', category: 'storage', priority: 'tier2' },
  { service_key: 'persistent-disk', category: 'storage', priority: 'tier2' },
  { service_key: 'block-storage', category: 'storage', priority: 'tier2' },
  { service_key: 'google-cloud-netapp-volumes', category: 'storage', priority: 'tier3' },
  { service_key: 'google-cloud-managed-lustre', category: 'storage', priority: 'tier3' },
  { service_key: 'storage-transfer-service', category: 'storage', priority: 'tier2' },
  { service_key: 'cloud-sql', category: 'database', priority: 'tier1' },
  { service_key: 'alloydb-for-postgresql', category: 'database', priority: 'tier2' },
  { service_key: 'firestore', category: 'database', priority: 'tier1' },
  { service_key: 'datastore-mode', category: 'database', priority: 'tier1' },
  { service_key: 'spanner', category: 'database', priority: 'tier1' },
  { service_key: 'bigtable', category: 'database', priority: 'tier1' },
  { service_key: 'memorystore', category: 'database', priority: 'tier1' },
  { service_key: 'bigquery', category: 'analytics', priority: 'tier1' },
  { service_key: 'dataflow', category: 'analytics', priority: 'tier2' },
  { service_key: 'dataproc', category: 'analytics', priority: 'tier2' },
  { service_key: 'managed-service-for-apache-spark', category: 'analytics', priority: 'tier2' },
  { service_key: 'managed-service-for-apache-kafka', category: 'analytics', priority: 'tier2' },
  { service_key: 'managed-service-for-apache-airflow', category: 'analytics', priority: 'tier2' },
  { service_key: 'cloud-data-fusion', category: 'analytics', priority: 'tier3' },
  { service_key: 'datastream', category: 'analytics', priority: 'tier2' },
  { service_key: 'database-migration-service', category: 'analytics', priority: 'tier2' },
  { service_key: 'pub-sub', category: 'messaging', priority: 'tier1' },
  { service_key: 'cloud-tasks', category: 'messaging', priority: 'tier1' },
  { service_key: 'eventarc', category: 'messaging', priority: 'tier1' },
  { service_key: 'workflows', category: 'integration', priority: 'tier1' },
  { service_key: 'application-integration', category: 'integration', priority: 'tier2' },
  { service_key: 'cloud-scheduler', category: 'integration', priority: 'tier1' },
  { service_key: 'api-gateway', category: 'api', priority: 'tier1' },
  { service_key: 'apigee', category: 'api', priority: 'tier2' },
  { service_key: 'cloud-endpoints', category: 'api', priority: 'tier2' },
  { service_key: 'virtual-private-cloud', category: 'networking', priority: 'tier1' },
  { service_key: 'cloud-dns', category: 'networking', priority: 'tier1' },
  { service_key: 'cloud-load-balancing', category: 'networking', priority: 'tier1' },
  { service_key: 'cloud-nat', category: 'networking', priority: 'tier2' },
  { service_key: 'private-service-connect', category: 'networking', priority: 'tier2' },
  { service_key: 'network-connectivity-center', category: 'networking', priority: 'tier2' },
  { service_key: 'cloud-cdn', category: 'networking', priority: 'tier2' },
  { service_key: 'cloud-service-mesh', category: 'networking', priority: 'tier2' },
  { service_key: 'cloud-ids', category: 'networking', priority: 'tier3' },
  { service_key: 'secure-web-proxy', category: 'networking', priority: 'tier3' },
  { service_key: 'cloud-iam', category: 'security', priority: 'tier1' },
  { service_key: 'secret-manager', category: 'security', priority: 'tier1' },
  { service_key: 'cloud-key-management', category: 'security', priority: 'tier1' },
  { service_key: 'identity-platform', category: 'security', priority: 'tier2' },
  { service_key: 'identity-aware-proxy', category: 'security', priority: 'tier2' },
  { service_key: 'cloud-armor', category: 'security', priority: 'tier2' },
  { service_key: 'vpc-service-controls', category: 'security', priority: 'tier2' },
  { service_key: 'security-command-center', category: 'security', priority: 'tier3' },
  { service_key: 'artifact-registry', category: 'devops', priority: 'tier1' },
  { service_key: 'cloud-build', category: 'devops', priority: 'tier1' },
  { service_key: 'cloud-deploy', category: 'devops', priority: 'tier2' },
  { service_key: 'cloud-deployment-manager', category: 'devops', priority: 'tier2' },
  { service_key: 'infrastructure-manager', category: 'devops', priority: 'tier2' },
  { service_key: 'config-connector', category: 'devops', priority: 'tier2' },
  { service_key: 'cloud-logging', category: 'observability', priority: 'tier1' },
  { service_key: 'cloud-monitoring', category: 'observability', priority: 'tier1' },
  { service_key: 'cloud-trace', category: 'observability', priority: 'tier2' },
  { service_key: 'cloud-profiler', category: 'observability', priority: 'tier2' },
  { service_key: 'error-reporting', category: 'observability', priority: 'tier2' },
  { service_key: 'managed-service-for-prometheus', category: 'observability', priority: 'tier2' },
  { service_key: 'personalized-service-health', category: 'observability', priority: 'tier3' },
  { service_key: 'vertex-ai', category: 'ai', priority: 'tier1' },
  { service_key: 'document-ai', category: 'ai', priority: 'tier2' },
  { service_key: 'cloud-vision-api', category: 'ai', priority: 'tier2' },
  { service_key: 'cloud-speech-to-text', category: 'ai', priority: 'tier2' },
  { service_key: 'cloud-text-to-speech', category: 'ai', priority: 'tier2' },
  { service_key: 'translation-ai', category: 'ai', priority: 'tier2' },
  { service_key: 'cloud-natural-language', category: 'ai', priority: 'tier2' },
  { service_key: 'cloud-healthcare-api', category: 'industry', priority: 'tier3' },
];

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u0026/g, '&');
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeUrl(url) {
  return url.replace(/\/$/, '');
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'globalstack-gcp-coverage-fetcher/0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseProductCards(html) {
  const entries = [];
  const pattern = /<a href="([^"]+)" class="[^"]*"[^>]*track-type="product-card"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const rawUrl = match[1];
    const body = match[2];
    const titleMatch = body.match(/<div class="owa4Ee [^"]*">([\s\S]*?)<\/div>/);
    if (!titleMatch) continue;
    const descriptionMatch = body.match(/<div class="z5liZ [^"]*" title="([^"]*)">/);
    const badgeMatch = body.match(/<div class="w6Zsc [^"]*">([\s\S]*?)<\/div>/);
    const url = rawUrl.startsWith('http') ? rawUrl : `https://cloud.google.com${rawUrl}`;
    entries.push({
      name: stripTags(titleMatch[1]),
      url: normalizeUrl(url),
      description: descriptionMatch ? decodeEntities(descriptionMatch[1]).trim() : null,
      category_hint: badgeMatch ? stripTags(badgeMatch[1]) : null,
      source: 'products-page-product-card',
    });
  }
  return entries;
}

function parseEmbeddedTuples(html) {
  const entries = [];
  const tuplePattern = /\[\[&quot;([^&]+?)&quot;,&quot;(https:\/\/[^&]+?)&quot;,(?:null|&quot;[^&]*&quot;),&quot;([^&]*?)&quot;/g;
  let match;
  while ((match = tuplePattern.exec(html)) !== null) {
    const [, rawName, rawUrl, rawDescription] = match;
    entries.push({
      name: decodeEntities(rawName),
      url: normalizeUrl(decodeEntities(rawUrl)),
      description: decodeEntities(rawDescription),
      category_hint: null,
      source: 'products-page-embedded-tuple',
    });
  }

  const slugMapPattern = /\[&quot;([^&]+?)&quot;,\[&quot;([^&]+?)&quot;,&quot;(https:\/\/cloud\.google\.com\/[^&]+?)&quot;(?:,\d+)?\]\]/g;
  while ((match = slugMapPattern.exec(html)) !== null) {
    const [, , rawName, rawUrl] = match;
    entries.push({
      name: decodeEntities(rawName),
      url: normalizeUrl(decodeEntities(rawUrl)),
      description: null,
      category_hint: null,
      source: 'products-page-embedded-map',
    });
  }
  return entries;
}

function shouldKeepCatalogEntry(entry) {
  if (!entry?.name || !entry?.url) return false;
  if (rejectedNames.has(entry.name)) return false;

  const url = new URL(entry.url);
  const path = url.pathname.replace(/\/$/, '') || '/';
  if (rejectedPathPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.some(part => rejectedPathSegments.has(part))) {
    return false;
  }

  if (
    path === '/products/management' ||
    path === '/products/storage' ||
    path === '/products/databases' ||
    path === '/products/observability' ||
    path === '/products/security-and-identity' ||
    path === '/products/networking'
  ) {
    return false;
  }

  if (entry.name === 'Operations Suite' && entry.url === 'https://cloud.google.com/stackdriver') {
    return false;
  }

  return true;
}

function canonicalizeName(entry) {
  if (canonicalNameOverrides.has(entry.url)) {
    return canonicalNameOverrides.get(entry.url);
  }
  return entry.name;
}

function mergeEntry(existing, entry) {
  existing.sources.add(entry.source);
  if (entry.category_hint) existing.category_hints.add(entry.category_hint);
  if (entry.description && (!existing.description || entry.description.length > existing.description.length)) {
    existing.description = entry.description;
  }
  if (entry.name !== existing.name) {
    existing.aliases.add(entry.name);
  }
}

function buildCoverageLookup(items) {
  const lookup = new Map();
  for (const item of items) {
    for (const name of item.names) {
      lookup.set(slugify(name), item);
    }
    lookup.set(normalizeUrl(item.url), item);
  }
  return lookup;
}

const officialLookup = buildCoverageLookup(officialEmulatorCoverage);
const localgcpLookup = buildCoverageLookup(localgcpCoverage);

function resolveOfficialCoverage(record) {
  const direct = officialLookup.get(slugify(record.name)) ?? officialLookup.get(record.url);
  if (direct) {
    return {
      supported: true,
      doc_url: direct.docUrl,
      notes: direct.notes,
    };
  }
  for (const alias of record.aliases) {
    const match = officialLookup.get(slugify(alias));
    if (match) {
      return {
        supported: true,
        doc_url: match.docUrl,
        notes: match.notes,
      };
    }
  }
  return {
    supported: false,
    doc_url: null,
    notes: [],
  };
}

function resolveLocalgcpCoverage(record) {
  const direct = localgcpLookup.get(slugify(record.name)) ?? localgcpLookup.get(record.url);
  if (direct) {
    return {
      supported: true,
      source_url: localgcpUrl,
      notes: direct.notes,
    };
  }
  for (const alias of record.aliases) {
    const match = localgcpLookup.get(slugify(alias));
    if (match) {
      return {
        supported: true,
        source_url: localgcpUrl,
        notes: match.notes,
      };
    }
  }
  return {
    supported: false,
    source_url: localgcpUrl,
    notes: [],
  };
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function summarizeCoverage(items) {
  const count = items.length;
  const official = items.filter(item => item.official_google_emulator.supported).length;
  const localgcp = items.filter(item => item.localgcp.supported).length;
  const either = items.filter(item => item.official_google_emulator.supported || item.localgcp.supported).length;
  const overlap = items.filter(item => item.official_google_emulator.supported && item.localgcp.supported).length;
  return {
    service_count: count,
    official_google_emulator_supported_count: official,
    official_google_emulator_supported_percent: percent(official, count),
    localgcp_supported_count: localgcp,
    localgcp_supported_percent: percent(localgcp, count),
    either_supported_count: either,
    either_supported_percent: percent(either, count),
    overlap_supported_count: overlap,
    overlap_supported_percent: percent(overlap, count),
  };
}

const productsHtml = await fetchText(productsUrl);
await fetchText(localgcpUrl);

const rawCatalogEntries = [
  ...parseProductCards(productsHtml),
  ...parseEmbeddedTuples(productsHtml),
  ...manualCatalogEntries.map(entry => ({
    ...entry,
    url: normalizeUrl(entry.url),
    category_hint: null,
  })),
];

const records = new Map();
for (const rawEntry of rawCatalogEntries) {
  if (!shouldKeepCatalogEntry(rawEntry)) continue;

  const canonicalName = canonicalizeName(rawEntry);
  const key = slugify(canonicalName);
  const normalizedRecord = {
    name: canonicalName,
    url: rawEntry.url,
    description: rawEntry.description ?? null,
    category_hint: rawEntry.category_hint ?? null,
    source: rawEntry.source,
  };

  if (!records.has(key)) {
    records.set(key, {
      name: canonicalName,
      url: rawEntry.url,
      description: rawEntry.description ?? null,
      aliases: new Set(),
      category_hints: new Set(rawEntry.category_hint ? [rawEntry.category_hint] : []),
      sources: new Set([rawEntry.source]),
    });
    if (rawEntry.name !== canonicalName) {
      records.get(key).aliases.add(rawEntry.name);
    }
    continue;
  }

  mergeEntry(records.get(key), normalizedRecord);
}

const services = {};
for (const [key, record] of [...records.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
  const aliases = [...record.aliases].sort((a, b) => a.localeCompare(b));
  const categoryHints = [...record.category_hints].sort((a, b) => a.localeCompare(b));
  const official = resolveOfficialCoverage({ name: record.name, aliases, url: record.url });
  const localgcp = resolveLocalgcpCoverage({ name: record.name, aliases, url: record.url });

  services[key] = {
    name: record.name,
    product_url: record.url,
    description: record.description,
    aliases,
    category_hints: categoryHints,
    sources: [...record.sources].sort((a, b) => a.localeCompare(b)),
    official_google_emulator: official,
    localgcp,
  };
}

const serviceList = Object.values(services);
const curatedServices = {};
const missingCuratedServices = [];
for (const entry of curatedIacRuntimeInventory) {
  const service = services[entry.service_key];
  if (!service) {
    missingCuratedServices.push(entry);
    continue;
  }
  curatedServices[entry.service_key] = {
    category: entry.category,
    priority: entry.priority,
    ...service,
  };
}

if (missingCuratedServices.length > 0) {
  throw new Error(`Curated GCP inventory references missing services: ${missingCuratedServices.map(item => item.service_key).join(', ')}`);
}

const broadSummary = summarizeCoverage(serviceList);
const curatedSummary = summarizeCoverage(Object.values(curatedServices));
const coverage = {
  _meta: {
    generated_at: new Date().toISOString(),
    products_catalog_url: productsUrl,
    localgcp_url: localgcpUrl,
    catalog_service_count: broadSummary.service_count,
    official_google_emulator_supported_count: broadSummary.official_google_emulator_supported_count,
    official_google_emulator_supported_percent: broadSummary.official_google_emulator_supported_percent,
    localgcp_supported_count: broadSummary.localgcp_supported_count,
    localgcp_supported_percent: broadSummary.localgcp_supported_percent,
    either_supported_count: broadSummary.either_supported_count,
    either_supported_percent: broadSummary.either_supported_percent,
    overlap_supported_count: broadSummary.overlap_supported_count,
    overlap_supported_percent: broadSummary.overlap_supported_percent,
    curated_iac_runtime_service_count: curatedSummary.service_count,
    curated_official_google_emulator_supported_count: curatedSummary.official_google_emulator_supported_count,
    curated_official_google_emulator_supported_percent: curatedSummary.official_google_emulator_supported_percent,
    curated_localgcp_supported_count: curatedSummary.localgcp_supported_count,
    curated_localgcp_supported_percent: curatedSummary.localgcp_supported_percent,
    curated_either_supported_count: curatedSummary.either_supported_count,
    curated_either_supported_percent: curatedSummary.either_supported_percent,
    curated_overlap_supported_count: curatedSummary.overlap_supported_count,
    curated_overlap_supported_percent: curatedSummary.overlap_supported_percent,
    notes: [
      'This snapshot uses the public Google Cloud products catalog as the service list baseline.',
      'curated_iac_runtime_inventory is the product-planning denominator for services that are plausible GlobalStack IaC/runtime emulation targets.',
      'Official emulator support is limited to the Google Cloud emulator docs explicitly tracked in this file.',
      'localgcp support is recorded from the public localgcp site only and is landscape input, not a GlobalStack claim.',
      'Datastore mode is included as a manual supplement because Google documents local Datastore-mode testing via the Firestore emulator.',
    ],
  },
  sources: {
    products_catalog: productsUrl,
    official_google_emulators: {
      overview: 'https://docs.cloud.google.com/sdk/gcloud/reference/emulators',
      firestore_datastore: 'https://cloud.google.com/datastore/docs/emulator',
      pubsub: 'https://cloud.google.com/pubsub/docs/emulator',
      bigtable: 'https://cloud.google.com/bigtable/docs/emulator',
      spanner: 'https://cloud.google.com/spanner/docs/emulator',
    },
    localgcp: localgcpUrl,
  },
  curated_iac_runtime_inventory: {
    summary: curatedSummary,
    selection_policy: [
      'Include GCP services that commonly appear in enterprise IaC graphs.',
      'Include services with meaningful runtime, data-plane, networking, identity, observability, or orchestration behavior.',
      'Exclude broad marketing pages, solution pages, pricing pages, learning pages, and aggregate product-family pages.',
    ],
    services: curatedServices,
  },
  services,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(coverage, null, 2)}\n`);

console.log(`Wrote ${outPath}`);
console.log(`Catalog services: ${coverage._meta.catalog_service_count}`);
console.log(`Official emulator support: ${coverage._meta.official_google_emulator_supported_count}`);
console.log(`localgcp support: ${coverage._meta.localgcp_supported_count}`);
console.log(`Curated IaC/runtime services: ${coverage._meta.curated_iac_runtime_service_count}`);
console.log(`Curated official emulator support: ${coverage._meta.curated_official_google_emulator_supported_count}`);
console.log(`Curated localgcp support: ${coverage._meta.curated_localgcp_supported_count}`);
