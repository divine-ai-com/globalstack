import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsBase = 'https://docs.localstack.cloud';
const servicesUrl = `${docsBase}/azure/services/`;
const outPath = join(root, 'docs', 'localstack-azure', 'coverage.json');

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'globalstack-localstack-azure-coverage-fetcher/0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function decodeEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, '')).trim();
}

function parseServicePages(html) {
  const pages = [];
  const seen = new Set();
  const serviceBoxPattern = /<a href="(\/azure\/services\/[^"]+)" class="service-box">[\s\S]*?<h3 class="service-box-title">([\s\S]*?)<\/h3>[\s\S]*?<p class="service-box-description">([\s\S]*?)<\/p>/g;
  let match;
  while ((match = serviceBoxPattern.exec(html)) !== null) {
    const href = match[1].replace(/\/$/, '');
    if (seen.has(href)) continue;
    seen.add(href);
    pages.push({
      title: stripTags(match[2]),
      description: stripTags(match[3]),
      href,
      url: `${docsBase}${href}/`,
    });
  }
  return pages.sort((a, b) => a.title.localeCompare(b.title));
}

function parseCoverageManifest(html) {
  const manifestMatch = html.match(/\/_astro\/AzureFeatureCoverage\.[A-Za-z0-9_-]+\.js/);
  return manifestMatch?.[0] ?? null;
}

function parseCoverageModules(featureModuleText) {
  const modules = [];
  const pattern = /"\/src\/data\/azure-coverage\/([^"]+\.json)":\(\)=>e\(\(\)=>import\("\.\/([^"]+\.js)"\),\[\]\)/g;
  let match;
  while ((match = pattern.exec(featureModuleText)) !== null) {
    modules.push({
      sourceJson: match[1],
      moduleFile: match[2],
      moduleUrl: `${docsBase}/_astro/${match[2]}`,
    });
  }
  return modules.sort((a, b) => a.sourceJson.localeCompare(b.sourceJson));
}

async function importCoverageModule(moduleUrl) {
  const moduleText = await fetchText(moduleUrl);
  const encoded = Buffer.from(moduleText, 'utf8').toString('base64');
  const imported = await import(`data:text/javascript;base64,${encoded}`);
  return imported.default ?? {
    service: imported.service,
    operations: imported.operations,
    details: imported.details,
  };
}

function flattenDetails(details = {}) {
  const operations = {};
  for (const [resourceGroup, groupOps] of Object.entries(details)) {
    for (const [operationName, raw] of Object.entries(groupOps ?? {})) {
      const key = `${resourceGroup}.${operationName}`;
      operations[key] = {
        implemented: Boolean(raw?.implemented),
        tier: raw?.pro === true ? 'pro' : 'community',
        pro: raw?.pro === true,
        snapshot: typeof raw?.snapshot === 'boolean' ? raw.snapshot : null,
        cloud_validated: null,
        tested_parameters: [],
      };
    }
  }
  return operations;
}

function summarizeServices(services) {
  let totalOperations = 0;
  let implementedOperations = 0;
  let proOperations = 0;
  let snapshotOperations = 0;
  for (const operations of Object.values(services)) {
    for (const operation of Object.values(operations)) {
      totalOperations += 1;
      if (operation.implemented) implementedOperations += 1;
      if (operation.pro) proOperations += 1;
      if (operation.snapshot) snapshotOperations += 1;
    }
  }
  return {
    total_operations: totalOperations,
    implemented_operations: implementedOperations,
    pro_operations: proOperations,
    snapshot_operations: snapshotOperations,
  };
}

const indexHtml = await fetchText(servicesUrl);
const servicePages = parseServicePages(indexHtml);
let manifestPath = parseCoverageManifest(indexHtml);
if (!manifestPath) {
  for (const page of servicePages) {
    const pageHtml = await fetchText(page.url);
    manifestPath = parseCoverageManifest(pageHtml);
    if (manifestPath) break;
  }
}
if (!manifestPath) {
  throw new Error('Could not find AzureFeatureCoverage module on Azure service index or service pages');
}
const manifestUrl = `${docsBase}${manifestPath}`;
const featureModuleText = await fetchText(manifestUrl);
const coverageModules = parseCoverageModules(featureModuleText);

const services = {};
const providerModules = {};
for (const moduleRef of coverageModules) {
  const coverage = await importCoverageModule(moduleRef.moduleUrl);
  const provider = coverage.service ?? moduleRef.sourceJson.replace(/\.json$/, '');
  const flattened = flattenDetails(coverage.details ?? {});
  services[provider] = flattened;
  providerModules[provider] = {
    source_json: moduleRef.sourceJson,
    module: moduleRef.moduleFile,
    module_url: moduleRef.moduleUrl,
    operation_count: Object.keys(flattened).length,
    implemented_operations: Object.values(flattened).filter(op => op.implemented).length,
  };
}

const summary = summarizeServices(services);
const generatedAt = new Date().toISOString();
const coverage = {
  _meta: {
    generated_at: generatedAt,
    source: docsBase,
    service_index: servicesUrl,
    manifest: manifestPath.split('/').pop(),
    service_page_count: servicePages.length,
    provider_count: Object.keys(services).length,
    ...summary,
    cloud_validated_operations: null,
    notes: [
      'Generated in /home/ubuntu/globalstack only; HAAWK repo was read as a shape reference and was not modified.',
      'LocalStack for Azure currently exposes implemented/pro/snapshot flags in AzureFeatureCoverage modules.',
      'Azure coverage modules do not expose an AWS-style aws_validated flag; cloud_validated is null.',
    ],
  },
  service_pages: servicePages,
  provider_modules: providerModules,
  services,
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(coverage, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(`Providers: ${coverage._meta.provider_count}`);
console.log(`Service pages: ${coverage._meta.service_page_count}`);
console.log(`Operations: ${coverage._meta.implemented_operations}/${coverage._meta.total_operations} implemented`);
