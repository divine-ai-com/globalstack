import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));
const endpoint = (process.env.AZURE_RESOURCE_MANAGER_ENDPOINT ?? process.env.ARM_ENDPOINT ?? "").replace(/\/$/, "");
if (!endpoint) {
  throw new Error("AZURE_RESOURCE_MANAGER_ENDPOINT or ARM_ENDPOINT must be set");
}
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID;
const resourceGroup = metadata.resourceNames.resourceGroup;
const token = JSON.parse(await readFile(process.env.AZURE_ACCESS_TOKEN_PATH, "utf8")).access_token;
const rawOutputs = JSON.parse(await readFile(process.env.AZURE_DEPLOYMENT_OUTPUTS_PATH, "utf8"));

function normalizeOutputValue(value) {
  if (value && typeof value === "object") {
    if ("value" in value) {
      return normalizeOutputValue(value.value);
    }
    if ("secret" in value && value.secret && typeof value.secret === "object" && "value" in value.secret) {
      return normalizeOutputValue(value.secret.value);
    }
  }
  return value;
}

const outputs = Object.fromEntries(
  Object.entries(rawOutputs).map(([key, value]) => [key, normalizeOutputValue(value)]),
);

for (const [outputKey, expectedValue] of Object.entries(metadata.expectedOutputs)) {
  if (!(outputKey in outputs)) {
    throw new Error(`missing output ${outputKey}`);
  }
  if (outputs[outputKey] !== expectedValue) {
    throw new Error(`unexpected output value for ${outputKey}: ${outputs[outputKey]}`);
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.json();
}

const rgPayload = await getJson(`${endpoint}/subscriptions/${subscriptionId}/resourcegroups/${resourceGroup}?api-version=2021-04-01`);
if (rgPayload.name !== resourceGroup) {
  throw new Error("resource group readback mismatch");
}

for (const check of metadata.integrationChecks) {
  const url = `${endpoint}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${check.provider}/${check.typePath}?api-version=${check.apiVersion}`;
  const payload = await getJson(url);
  if (payload.name !== check.expectedName) {
    throw new Error(`unexpected resource name for ${check.label}: ${payload.name}`);
  }
  if (payload.type !== check.expectedType) {
    throw new Error(`unexpected resource type for ${check.label}: ${payload.type}`);
  }
}

console.log("integration assertions passed");
