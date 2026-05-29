const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const projectId = config.require("projectId");
const secretId = config.require("secretId");
const runId = config.require("runId");
const secretPayload = config.require("secretPayload");
const accessToken = config.get("accessToken") || "globalstack-local-token";
const secretManagerEndpoint = config.require("secretManagerEndpoint");

const provider = new gcp.Provider("gcpProvider", {
  project: projectId,
  accessToken,
  secretManagerCustomEndpoint: secretManagerEndpoint,
});

const secret = new gcp.secretmanager.Secret("appConfig", {
  secretId,
  replication: {
    auto: {},
  },
  labels: {
    purpose: "globalstack-conformance",
    owner: "globalstack",
    run_id: runId,
  },
}, { provider });

const version = new gcp.secretmanager.SecretVersion("current", {
  secret: secret.id,
  secretData: secretPayload,
}, { provider });

exports.secretId = secret.secretId;
exports.secretName = secret.name;
exports.secretVersion = version.name;
