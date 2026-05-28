import { supportClasses, assertSupportClass } from './support-classes.mjs';

const firstBucket = [
  {
    key: 'cloud-storage',
    name: 'Cloud Storage',
    category: 'storage',
    engineStrategy: 'real object-store backend with Google Cloud Storage JSON/XML API compatibility',
    serviceModule: './storage/service.mjs',
    supportClass: supportClasses.boundedRuntime,
    supportClaim: 'Bounded local runtime for captured Cloud Storage JSON API bucket/object lifecycle. Terraform, OpenTofu, Pulumi, gcloud, and Node.js SDK lifecycles pass; Config Connector and Crossplane gates are still pending.',
  },
  {
    key: 'pub-sub',
    name: 'Pub/Sub',
    category: 'messaging',
    engineStrategy: 'official Pub/Sub emulator first, broker-backed behavior where the official emulator is insufficient',
    serviceModule: './pubsub/service.mjs',
  },
  {
    key: 'firestore',
    name: 'Firestore',
    category: 'database',
    engineStrategy: 'official Firestore emulator',
    serviceModule: './firestore/service.mjs',
  },
  {
    key: 'datastore-mode',
    name: 'Datastore mode',
    category: 'database',
    engineStrategy: 'official Firestore emulator in Datastore mode',
    serviceModule: './firestore/service.mjs',
  },
  {
    key: 'secret-manager',
    name: 'Secret Manager',
    category: 'security',
    engineStrategy: 'executable versioned local secret store',
    serviceModule: './secret-manager/service.mjs',
  },
  {
    key: 'cloud-key-management',
    name: 'Cloud KMS',
    category: 'security',
    engineStrategy: 'executable local key engine for encrypt/decrypt/sign/verify subset',
    serviceModule: './kms/service.mjs',
  },
  {
    key: 'cloud-logging',
    name: 'Cloud Logging',
    category: 'observability',
    engineStrategy: 'local log store with write/list/query subset',
    serviceModule: './logging/service.mjs',
  },
  {
    key: 'cloud-tasks',
    name: 'Cloud Tasks',
    category: 'messaging',
    engineStrategy: 'executable scheduler and HTTP dispatcher with retry semantics',
    serviceModule: './cloud-tasks/service.mjs',
  },
];

export const serviceCatalog = Object.freeze(firstBucket.map(service => freezeService({
  supportClass: supportClasses.unsupported,
  supportClaim: 'Not implemented in GlobalStack GCP yet. This entry records the intended real-engine strategy only.',
  ...service,
})));

function freezeService(service) {
  assertSupportClass(service.supportClass);
  return Object.freeze(service);
}

export function listServices() {
  return [...serviceCatalog];
}

export function getService(key) {
  return serviceCatalog.find(service => service.key === key) ?? null;
}
