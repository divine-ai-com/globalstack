const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const projectId = config.require("projectId");
const location = config.require("location");
const keyRingId = config.require("keyRingId");
const cryptoKeyId = config.require("cryptoKeyId");
const accessToken = config.get("accessToken") || "globalstack-local-token";
const kmsEndpoint = config.require("kmsEndpoint");

const provider = new gcp.Provider("gcpProvider", {
  project: projectId,
  accessToken,
  kmsCustomEndpoint: kmsEndpoint,
});

const keyRing = new gcp.kms.KeyRing("app", {
  name: keyRingId,
  location,
}, { provider });

const cryptoKey = new gcp.kms.CryptoKey("appConfig", {
  name: cryptoKeyId,
  keyRing: keyRing.id,
  purpose: "ENCRYPT_DECRYPT",
  labels: {
    purpose: "globalstack-conformance",
    owner: "globalstack",
  },
}, { provider });

exports.keyRingName = keyRing.id;
exports.cryptoKeyName = cryptoKey.id;
