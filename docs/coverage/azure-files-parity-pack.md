# Azure Files Parity Pack

This pack is the local acceptance suite for Azure Files share control-plane behavior and REST-shaped local file data-plane behavior before the EFS equivalent moves closer to 99% parity. It also records the current Azure NetApp Files boundary: NetApp volume paths must not silently succeed until NetApp account and capacity-pool parents are modeled. It does not replace live Azure capture for SMB/NFS protocol behavior, Shared Key signature validation, identity-based mount, snapshots, leases, backup/restore, quota enforcement, Azure NetApp Files lifecycle, RBAC, private link, throttling, or exact Azure service runtime behavior.

Executable check:

```bash
npm run e2e:azure-files-parity
```

Use the fast loop while editing:

```bash
npm run e2e:azure-files-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group and storage account parent precondition handling.
- Storage account async readiness before file share creation.
- Azure Files share create/get/list/update/delete/post-delete lifecycle.
- Parameter rejection for invalid file share name, invalid quota, invalid enabled protocol, and invalid access tier.
- Share metadata for local quota, protocol, and access-tier fields.
- Azure Files REST-shaped local data-plane behavior for share properties, auth/header rejection, directory creation, parent-not-found, file creation, range upload, read, directory list, delete, and post-delete not-found.
- Unsupported file share child/action routes, including snapshot, lease, and restore routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- Azure NetApp volume create/list remains an explicit parent gap until NetApp parent resources are modeled.
- Unsupported Azure NetApp volume child routes fail closed.
- ARM template deployment can create a storage account and file share.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Files share control-plane lifecycle, local parameter rejection cases, REST-shaped local file data-plane behavior, unsupported route boundaries, explicit Azure NetApp gap behavior, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Azure Files is `cloudValidated` for SMB/NFS protocol behavior, Shared Key signature validation, identity-based mount, snapshots, leases, backup/restore, quota enforcement, Azure NetApp Files lifecycle, RBAC, private link, throttling, or exact Azure service runtime behavior.
