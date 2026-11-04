const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");

const config = new pulumi.Config();
const projectId = config.require("projectId");
const topicName = config.require("topicName");
const subscriptionName = config.require("subscriptionName");
const runId = config.require("runId");
const accessToken = config.get("accessToken") || "globalstack-local-token";
const pubsubEndpoint = config.require("pubsubEndpoint");

const provider = new gcp.Provider("gcpProvider", {
  project: projectId,
  accessToken,
  pubsubCustomEndpoint: pubsubEndpoint,
});

const topic = new gcp.pubsub.Topic("topic", {
  name: topicName,
  labels: {
    purpose: "globalstack-conformance",
    owner: "globalstack",
    run_id: runId,
  },
}, { provider });

const subscription = new gcp.pubsub.Subscription("subscription", {
  name: subscriptionName,
  topic: topic.name,
  ackDeadlineSeconds: 20,
  messageRetentionDuration: "604800s",
  labels: {
    purpose: "globalstack-conformance",
    owner: "globalstack",
    run_id: runId,
  },
}, { provider });

exports.topicName = topic.name;
exports.subscriptionName = subscription.name;
