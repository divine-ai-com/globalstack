# Azure Event Hubs Parity Pack

This pack is the local acceptance suite for Azure Event Hubs namespace and event hub control-plane behavior before the Kinesis Data Streams equivalent moves closer to 99% parity. It does not replace live Azure capture for AMQP/Kafka data-plane semantics, partition assignment, consumer groups, checkpoints, throughput-unit limits, capture, RBAC, private link, throttling, or exact Azure service runtime behavior.

Executable check:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:event-hubs-parity
```

Use the fast loop while editing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:event-hubs-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group and namespace parent precondition handling.
- Event Hubs namespace create/get/list/update/delete/post-delete lifecycle.
- Event hub create/get/list/update/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid namespace name, invalid namespace SKU/capacity, invalid event hub name, invalid partition count, and invalid retention.
- Endpoint and partition metadata for local Event Hubs resources.
- Unsupported Event Hubs child/action routes, including authorization-rule and consumer-group routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create a namespace and event hub.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Event Hubs control-plane lifecycle, local parameter rejection cases, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Event Hubs is `cloudValidated` for AMQP/Kafka data-plane semantics, partition assignment, consumer groups, checkpoints, throughput-unit limits, capture, RBAC, private link, throttling, or exact Azure service runtime behavior.
