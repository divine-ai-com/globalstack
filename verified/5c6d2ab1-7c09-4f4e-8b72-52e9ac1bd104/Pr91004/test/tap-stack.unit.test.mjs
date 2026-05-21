import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));

for (const relativePath of metadata.solutionFiles) {
  await readFile(join(root, relativePath), "utf8");
}

if (metadata.platformId !== "azure-pulumi-ts") {
  throw new Error(`unsupported Node unit-test platform ${metadata.platformId}`);
}

const pulumiYaml = await readFile(join(root, "Pulumi.yaml"), "utf8");
const packageJson = await readFile(join(root, "package.json"), "utf8");
const entry = await readFile(join(root, "bin/tap.ts"), "utf8");
const stack = await readFile(join(root, "lib/tap-stack.ts"), "utf8");

for (const marker of ["runtime: nodejs", "main: bin/tap.ts"]) {
  if (!pulumiYaml.includes(marker)) {
    throw new Error(`Pulumi.yaml is missing ${marker}`);
  }
}

for (const marker of [
  '"@pulumi/azure-native": "^2.80.0"',
  '"@pulumi/pulumi": "^3.122.0"',
  '"typescript": "^5.0.0"'
]) {
  if (!packageJson.includes(marker)) {
    throw new Error(`package.json is missing ${marker}`);
  }
}

for (const marker of ["createTapStack", "../lib/tap-stack"]) {
  if (!entry.includes(marker)) {
    throw new Error(`bin/tap.ts is missing ${marker}`);
  }
}

for (const marker of [
  'import * as storage from "@pulumi/azure-native/storage"',
  'import * as eventgrid from "@pulumi/azure-native/eventgrid"',
  'import * as appconfiguration from "@pulumi/azure-native/appconfiguration"',
  "new resources.ResourceGroup(",
  "new storage.StorageAccount(",
  "new storage.BlobContainer(",
  "new storage.Queue(",
  "new storage.Table(",
  "new eventgrid.Topic(",
  "new appconfiguration.ConfigurationStore("
]) {
  if (!stack.includes(marker)) {
    throw new Error(`lib/tap-stack.ts is missing ${marker}`);
  }
}

for (const value of [
  metadata.resourceNames.resourceGroup,
  metadata.resourceNames.storageAccount,
  metadata.resourceNames.blobContainerName,
  metadata.resourceNames.queueName,
  metadata.resourceNames.tableName,
  metadata.resourceNames.eventGridTopic,
  metadata.resourceNames.appConfigStore
]) {
  if (!stack.includes(value)) {
    throw new Error(`lib/tap-stack.ts is missing concrete contract value ${value}`);
  }
}

for (const outputKey of metadata.expectedOutputKeys) {
  if (!entry.includes(`export const ${outputKey}`)) {
    throw new Error(`bin/tap.ts is missing export ${outputKey}`);
  }
}

console.log("unit assertions passed");
