const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const projectId = config.require("projectId");
const metricId = config.require("metricId");
const metricFilter = config.require("metricFilter");
const accessToken = config.get("accessToken") || "globalstack-local-token";
const loggingEndpoint = config.require("loggingEndpoint");

const provider = new gcp.Provider("gcpProvider", {
  project: projectId,
  accessToken,
  loggingCustomEndpoint: loggingEndpoint,
});

const metric = new gcp.logging.Metric("workflowErrors", {
  name: metricId,
  description: "GlobalStack conformance workflow error counter",
  filter: metricFilter,
  metricDescriptor: {
    displayName: "GlobalStack workflow errors",
    metricKind: "DELTA",
    valueType: "INT64",
    unit: "1",
  },
}, { provider });

exports.metricId = metric.name;
exports.metricFilter = metric.filter;
