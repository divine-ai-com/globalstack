const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const projectId = config.require("projectId");
const bucketLocation = config.get("bucketLocation") || "US";
const bucketName = config.require("bucketName");
const objectName = config.require("objectName");
const runId = config.require("runId");
const accessToken = config.get("accessToken") || "globalstack-local-token";
const storageEndpoint = config.require("storageEndpoint");
const computeEndpoint = config.require("computeEndpoint");

const provider = new gcp.Provider("gcpProvider", {
  project: projectId,
  accessToken,
  storageCustomEndpoint: storageEndpoint,
  computeCustomEndpoint: computeEndpoint,
});

const bucket = new gcp.storage.Bucket("bucket", {
  name: bucketName,
  location: bucketLocation,
  forceDestroy: true,
  uniformBucketLevelAccess: true,
  labels: {
    purpose: "globalstack-conformance",
    owner: "globalstack",
    run_id: runId,
  },
  versioning: {
    enabled: true,
  },
}, { provider });

const sample = new gcp.storage.BucketObject("sample", {
  name: objectName,
  bucket: bucket.name,
  content: JSON.stringify({
    run_id: runId,
    purpose: "globalstack gcp pulumi",
  }),
  contentType: "application/json",
}, { provider });

exports.bucketName = bucket.name;
exports.bucketLocation = bucket.location;
exports.objectName = sample.name;
