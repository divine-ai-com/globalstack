import pulumi
from pulumi_azure_native import resources
config = pulumi.Config()
group = resources.ResourceGroup("group", resource_group_name=config.require("groupName"), location=config.require("location"), tags={"project": "globalstack-paired-lifecycle", "run": config.require("runId"), "expires": config.require("expires"), "revision": config.require("revision")})
pulumi.export("groupId", group.id)
