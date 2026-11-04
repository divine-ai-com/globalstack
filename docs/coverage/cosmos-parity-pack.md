# Azure Cosmos DB NoSQL/Table Parity Pack

This pack is the local acceptance suite for Azure Cosmos DB account, NoSQL SQL database/container, Storage Table control-plane behavior, and a REST-shaped local Cosmos SQL item data-plane slice before the DynamoDB-equivalent capability moves closer to 99% parity. It does not replace live Azure capture for full SQL query behavior, partition routing, indexing policy, consistency, change feed, multi-region failover, throughput autoscale, RBAC, private link, or exact Cosmos DB/Table data-plane behavior.

Executable check:

```bash
npm run e2e:cosmos-parity
```

Use the fast loop while editing:

```bash
npm run e2e:cosmos-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group precondition handling.
- Cosmos DB account create/get/list/update/delete/post-delete lifecycle.
- Cosmos DB account negative variance for invalid location, invalid account name, missing offer type, missing locations, and invalid consistency level.
- NoSQL SQL database create/get/list/delete/post-delete lifecycle.
- NoSQL SQL database negative variance for parent-not-found, name/resource-id mismatch, and invalid throughput.
- NoSQL SQL container create/get/list/delete/post-delete lifecycle.
- NoSQL SQL container negative variance for parent-not-found, name/resource-id mismatch, missing partition key, and invalid partition-key kind.
- Cosmos SQL REST-shaped local data-plane behavior for required auth/date/version headers, unknown account host rejection, database/container reads, duplicate rejection, document partition-key validation, document list/read/replace/query/delete behavior, wrong-partition delete non-removal, and post-delete not-found.
- ARM/data-plane cleanup coupling for SQL containers: once the ARM container is deleted, the local Cosmos SQL data-plane route is no longer available.
- Storage Table child lifecycle reuse for the Table side of the DynamoDB-equivalent surface.
- Unsupported Cosmos child routes, including MongoDB database and stored procedure routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create Cosmos account, SQL database, SQL container, Storage Account, and Storage Table resources.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure management-plane lifecycle, local parameter rejection cases, REST-shaped local item CRUD/query checks, unsupported Cosmos route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Cosmos DB is `cloudValidated` for full SQL query semantics, partition routing, indexing, consistency guarantees, change feed, throughput accounting, multi-region behavior, RBAC, private link, throttling, or exact Azure data-plane behavior.
