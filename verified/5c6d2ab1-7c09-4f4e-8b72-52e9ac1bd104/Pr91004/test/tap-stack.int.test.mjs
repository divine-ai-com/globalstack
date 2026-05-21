import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));
const armEndpoint = (process.env.AZURE_RESOURCE_MANAGER_ENDPOINT ?? process.env.ARM_ENDPOINT ?? "").replace(/\/$/, "");
if (!armEndpoint) throw new Error("AZURE_RESOURCE_MANAGER_ENDPOINT or ARM_ENDPOINT must be set");

const blobEndpoint = (process.env.AZURE_STORAGE_BLOB_ENDPOINT ?? "").replace(/\/$/, "");
const queueEndpoint = (process.env.AZURE_STORAGE_QUEUE_ENDPOINT ?? "").replace(/\/$/, "");
const tableEndpoint = (process.env.AZURE_STORAGE_TABLE_ENDPOINT ?? "").replace(/\/$/, "");
const eventGridEndpoint = (process.env.AZURE_EVENT_GRID_PUBLISH_ENDPOINT ?? "").replace(/\/$/, "");
const appConfigEndpoint = (process.env.AZURE_APP_CONFIGURATION_ENDPOINT ?? "").replace(/\/$/, "");
const storageAccountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "";
if (!blobEndpoint || !queueEndpoint || !tableEndpoint || !eventGridEndpoint || !appConfigEndpoint || !storageAccountKey) {
  throw new Error("all Azure data-plane endpoint env vars must be set");
}

const subscriptionId = process.env.ARM_SUBSCRIPTION_ID;
const token = JSON.parse(await readFile(process.env.AZURE_ACCESS_TOKEN_PATH, "utf8")).access_token;
const rawOutputs = JSON.parse(await readFile(process.env.AZURE_DEPLOYMENT_OUTPUTS_PATH, "utf8"));

function normalizeOutputValue(value) {
  if (value && typeof value === "object") {
    if ("value" in value) return normalizeOutputValue(value.value);
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
  if (outputs[outputKey] !== expectedValue) {
    throw new Error(`unexpected output value for ${outputKey}: ${outputs[outputKey]}`);
  }
}

function httpJson(baseUrl, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `${baseUrl}/`);
    const payload = body === undefined
      ? undefined
      : Buffer.isBuffer(body)
        ? body
        : typeof body === "string"
          ? Buffer.from(body)
          : Buffer.from(JSON.stringify(body));
    const requestHeaders = { ...headers };
    if (payload && requestHeaders["content-length"] === undefined) {
      requestHeaders["content-length"] = String(payload.length);
    }
    const req = request(url, { method, headers: requestHeaders }, (res) => {
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = text;
        const contentType = String(res.headers["content-type"] ?? "");
        if (text && (contentType.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("["))) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: parsed, rawBody: text });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function armGet(path) {
  const response = await httpJson(armEndpoint, path, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ARM GET ${path} failed with ${response.status}`);
  }
  return response.body;
}

async function armPost(path, body = {}) {
  const response = await httpJson(armEndpoint, path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`ARM POST ${path} failed with ${response.status}`);
  }
  return response.body;
}

function canonicalizedHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .filter(([key]) => key.startsWith("x-ms-"))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("");
}

function canonicalizedResource(url, accountName) {
  const parts = [`/${accountName}${url.pathname}`];
  const grouped = new Map();
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (!grouped.has(lower)) grouped.set(lower, []);
    grouped.get(lower).push(value);
  }
  for (const [key, values] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${key}:${values.sort().join(",")}`);
  }
  return parts.join("\n");
}

function signSharedKey({ method, url, headers, bodyLength, accountName }) {
  const contentLength = bodyLength === 0 ? "" : String(bodyLength);
  const contentType = headers["content-type"] ?? "";
  const stringToSign = [
    method.toUpperCase(),
    "",
    "",
    contentLength,
    "",
    contentType,
    "",
    "",
    "",
    "",
    "",
    "",
    `${canonicalizedHeaders(headers)}${canonicalizedResource(url, accountName)}`,
  ].join("\n");
  return createHmac("sha256", Buffer.from(storageAccountKey, "base64"))
    .update(stringToSign, "utf8")
    .digest("base64");
}

function signSharedKeyLite({ url, headers, accountName }) {
  const stringToSign = [
    headers["x-ms-date"],
    canonicalizedResource(url, accountName),
  ].join("\n");
  return createHmac("sha256", Buffer.from(storageAccountKey, "base64"))
    .update(stringToSign, "utf8")
    .digest("base64");
}

async function storageRequest(baseUrl, host, path, { method, headers = {}, body, authScheme = "SharedKey" }) {
  const url = new URL(path, `${baseUrl}/`);
  const payload = body === undefined ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const requestHeaders = {
    host,
    "x-ms-date": new Date().toUTCString(),
    "x-ms-version": "2023-11-03",
    ...headers,
  };
  requestHeaders.authorization = authScheme === "SharedKeyLite"
    ? `SharedKeyLite ${outputs.DiagnosticsStorageAccountName}:${signSharedKeyLite({ url, headers: requestHeaders, accountName: outputs.DiagnosticsStorageAccountName })}`
    : `SharedKey ${outputs.DiagnosticsStorageAccountName}:${signSharedKey({ method, url, headers: requestHeaders, bodyLength: payload.length, accountName: outputs.DiagnosticsStorageAccountName })}`;
  const response = await httpJson(baseUrl, path, {
    method,
    headers: requestHeaders,
    body: payload.length === 0 ? undefined : payload,
  });
  return response;
}

function extractXmlValue(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1] : null;
}

const resourceGroup = metadata.resourceNames.resourceGroup;
const rgPayload = await armGet(`/subscriptions/${subscriptionId}/resourcegroups/${resourceGroup}?api-version=2021-04-01`);
if (rgPayload.name !== resourceGroup) {
  throw new Error("resource group readback mismatch");
}

const payloads = {};
for (const check of metadata.integrationChecks) {
  const payload = await armGet(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${check.provider}/${check.typePath}?api-version=${check.apiVersion}`);
  if (payload.name !== check.expectedName || payload.type !== check.expectedType) {
    throw new Error(`unexpected ARM resource for ${check.label}`);
  }
  payloads[check.label] = payload;
}

if (payloads["storage-account"].properties.minimumTlsVersion !== "TLS1_2") {
  throw new Error(`unexpected storage minimumTlsVersion ${payloads["storage-account"].properties.minimumTlsVersion}`);
}
if (payloads["app-config-store"].properties.endpoint !== `https://${outputs.FleetConfigStoreName}.azconfig.io`) {
  throw new Error(`unexpected App Configuration endpoint ${payloads["app-config-store"].properties.endpoint}`);
}

const diagnosticsManifestPath = "robot-001/session-2026-05-21/manifest.json";
const diagnosticsManifest = JSON.stringify({
  robotId: "robot-001",
  sessionId: "session-2026-05-21",
  imageCount: 18,
  captureMode: "night-shift",
});
const blobHost = `${outputs.DiagnosticsStorageAccountName}.blob.core.windows.net`;
const blobPut = await storageRequest(blobEndpoint, blobHost, `/${metadata.resourceNames.blobContainerName}/${diagnosticsManifestPath}`, {
  method: "PUT",
  headers: {
    "content-type": "application/json",
    "x-ms-blob-type": "BlockBlob",
  },
  body: diagnosticsManifest,
});
if (blobPut.status !== 201) {
  throw new Error(`blob upload failed with ${blobPut.status}`);
}

const blobGet = await storageRequest(blobEndpoint, blobHost, `/${metadata.resourceNames.blobContainerName}/${diagnosticsManifestPath}`, {
  method: "GET",
});
if (blobGet.status !== 200 || blobGet.rawBody !== diagnosticsManifest) {
  throw new Error("blob readback mismatch");
}

const queueHost = `${outputs.DiagnosticsStorageAccountName}.queue.core.windows.net`;
const queueMessage = {
  robotId: "robot-001",
  sessionId: "session-2026-05-21",
  blobPath: diagnosticsManifestPath,
};
const queuePut = await storageRequest(queueEndpoint, queueHost, `/${metadata.resourceNames.queueName}/messages`, {
  method: "POST",
  headers: {
    "content-type": "application/xml",
  },
  body: `<QueueMessage><MessageText>${Buffer.from(JSON.stringify(queueMessage)).toString("base64")}</MessageText></QueueMessage>`,
});
if (queuePut.status !== 201) {
  throw new Error(`queue enqueue failed with ${queuePut.status}`);
}

const queuePeek = await storageRequest(queueEndpoint, queueHost, `/${metadata.resourceNames.queueName}/messages?peekonly=true&numofmessages=1`, {
  method: "GET",
});
if (queuePeek.status !== 200) {
  throw new Error(`queue peek failed with ${queuePeek.status}`);
}
const peekedText = extractXmlValue(queuePeek.rawBody, "MessageText");
if (!peekedText) {
  throw new Error("queue peek missing MessageText");
}
const decodedQueueMessage = JSON.parse(Buffer.from(peekedText, "base64").toString("utf8"));
if (decodedQueueMessage.blobPath !== diagnosticsManifestPath) {
  throw new Error(`queue message blobPath mismatch ${decodedQueueMessage.blobPath}`);
}

const tableHost = `${outputs.DiagnosticsStorageAccountName}.table.core.windows.net`;
const ledgerEntity = {
  PartitionKey: "robot-001",
  RowKey: "session-2026-05-21",
  status: "queued",
  blobPath: diagnosticsManifestPath,
  imageCount: 18,
};
const tableInsert = await storageRequest(tableEndpoint, tableHost, `/${metadata.resourceNames.tableName}`, {
  method: "POST",
  headers: {
    accept: "application/json;odata=nometadata",
    "content-type": "application/json",
    prefer: "return-no-content",
  },
  body: JSON.stringify(ledgerEntity),
  authScheme: "SharedKeyLite",
});
if (tableInsert.status !== 201) {
  throw new Error(`table insert failed with ${tableInsert.status}`);
}

const tableGet = await storageRequest(
  tableEndpoint,
  tableHost,
  `/${metadata.resourceNames.tableName}(PartitionKey='robot-001',RowKey='session-2026-05-21')`,
  {
    method: "GET",
    headers: {
      accept: "application/json;odata=nometadata",
    },
    authScheme: "SharedKeyLite",
  },
);
if (tableGet.status !== 200 || tableGet.body.blobPath !== diagnosticsManifestPath || tableGet.body.status !== "queued") {
  throw new Error("table entity readback mismatch");
}

const appConfigHost = new URL(payloads["app-config-store"].properties.endpoint).host;
const configKey = encodeURIComponent("robotics/processing-mode");
const configHeaders = {
  Authorization: `Bearer ${token}`,
  host: appConfigHost,
  "content-type": "application/vnd.microsoft.appconfig.kv+json; charset=utf-8",
};
const configPut = await httpJson(appConfigEndpoint, `/kv/${configKey}?api-version=1.0&label=prod`, {
  method: "PUT",
  headers: configHeaders,
  body: {
    value: "strict",
    content_type: "text/plain",
    tags: {
      workload: "robotics",
      flow: "diagnostics-intake",
    },
  },
});
if (configPut.status !== 201 || configPut.body.value !== "strict") {
  throw new Error("App Configuration put failed");
}

const configLock = await httpJson(appConfigEndpoint, `/locks/${configKey}?api-version=1.0&label=prod`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    host: appConfigHost,
  },
});
if (configLock.status !== 200 || configLock.body.locked !== true) {
  throw new Error("App Configuration lock failed");
}

const lockedUpdate = await httpJson(appConfigEndpoint, `/kv/${configKey}?api-version=1.0&label=prod`, {
  method: "PUT",
  headers: configHeaders,
  body: {
    value: "relaxed",
  },
});
if (lockedUpdate.status !== 409) {
  throw new Error(`locked App Configuration update should fail, got ${lockedUpdate.status}`);
}

const configUnlock = await httpJson(appConfigEndpoint, `/locks/${configKey}?api-version=1.0&label=prod`, {
  method: "DELETE",
  headers: {
    Authorization: `Bearer ${token}`,
    host: appConfigHost,
  },
});
if (configUnlock.status !== 200 || configUnlock.body.locked !== false) {
  throw new Error("App Configuration unlock failed");
}

const configGet = await httpJson(appConfigEndpoint, `/kv/${configKey}?api-version=1.0&label=prod`, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${token}`,
    host: appConfigHost,
  },
});
if (configGet.status !== 200 || configGet.body.value !== "strict") {
  throw new Error("App Configuration get failed");
}

const configDelete = await httpJson(appConfigEndpoint, `/kv/${configKey}?api-version=1.0&label=prod`, {
  method: "DELETE",
  headers: {
    Authorization: `Bearer ${token}`,
    host: appConfigHost,
  },
});
if (configDelete.status !== 200 || configDelete.body.key !== "robotics/processing-mode") {
  throw new Error("App Configuration delete failed");
}

const listKeys = await armPost(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.EventGrid/topics/${metadata.resourceNames.eventGridTopic}/listKeys?api-version=2022-06-15`);
const eventGridHost = new URL(payloads["event-grid-topic"].properties.endpoint).host;
const validEvent = await httpJson(eventGridEndpoint, "/api/events?api-version=2018-01-01", {
  method: "POST",
  headers: {
    host: eventGridHost,
    "content-type": "application/json",
    "aeg-sas-key": listKeys.key1,
  },
  body: [
    {
      id: "evt-robot-001-session-2026-05-21",
      subject: `/robots/robot-001/diagnostics/session-2026-05-21`,
      eventType: "Robotics.Diagnostics.BatchQueued",
      eventTime: "2026-05-21T00:00:00Z",
      dataVersion: "1.0",
      data: {
        blobPath: diagnosticsManifestPath,
        queueName: metadata.resourceNames.queueName,
      },
    },
  ],
});
if (validEvent.status !== 200) {
  throw new Error(`Event Grid publish failed with ${validEvent.status}`);
}

const invalidEvent = await httpJson(eventGridEndpoint, "/api/events?api-version=2018-01-01", {
  method: "POST",
  headers: {
    host: eventGridHost,
    "content-type": "application/json",
    "aeg-sas-key": listKeys.key1,
  },
  body: {
    id: "invalid",
  },
});
if (invalidEvent.status !== 400) {
  throw new Error(`invalid Event Grid publish should fail with 400, got ${invalidEvent.status}`);
}

console.log("integration assertions passed");
