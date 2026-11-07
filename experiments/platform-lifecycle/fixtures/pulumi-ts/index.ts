import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
const config = new pulumi.Config();
const group = new resources.ResourceGroup("group", {
  resourceGroupName: config.require("groupName"),
  location: config.require("location"),
  tags: { project: "globalstack-paired-lifecycle", run: config.require("runId"), expires: config.require("expires"), revision: config.require("revision") },
});
export const groupId = group.id;
