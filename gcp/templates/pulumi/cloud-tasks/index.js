const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const projectId = config.require("projectId");
const location = config.require("location");
const queueId = config.require("queueId");
const accessToken = config.get("accessToken") || "globalstack-local-token";
const cloudTasksEndpoint = config.require("cloudTasksEndpoint");

const provider = new gcp.Provider("gcpProvider", {
  project: projectId,
  accessToken,
  cloudTasksCustomEndpoint: cloudTasksEndpoint,
});

const queue = new gcp.cloudtasks.Queue("workflow", {
  name: queueId,
  location,
  rateLimits: {
    maxConcurrentDispatches: 10,
    maxDispatchesPerSecond: 5,
  },
  retryConfig: {
    maxAttempts: 3,
    maxBackoff: "30s",
    maxDoublings: 2,
    maxRetryDuration: "120s",
    minBackoff: "1s",
  },
  stackdriverLoggingConfig: {
    samplingRatio: 1,
  },
}, { provider });

exports.queueName = queue.id;
