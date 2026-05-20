# Azure Logic Workflows Parity Pack

This pack is the local acceptance suite for Azure Logic Apps workflow control-plane behavior plus a local request-trigger runner before the Step Functions equivalent moves closer to 99% parity. It does not replace live Azure capture for connector execution, Azure-hosted trigger runtime behavior, retries, full run history, long-running orchestration, RBAC, private link, throttling, or exact Azure workflow data-plane behavior.

Executable check:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:logic-workflows-parity
```

Use the fast loop while editing:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:logic-workflows-parity -- --skip-platforms
```

## Scope

The pack verifies:

- GlobalStack Azure authentication and local subscription rejection.
- Missing `api-version` rejection.
- Resource group precondition handling.
- Logic workflow create/get/list/update/delete/post-delete lifecycle.
- Parameter rejection for invalid location, invalid workflow name, missing definition, missing triggers, missing actions, and invalid workflow state.
- Endpoint metadata for local workflow resources.
- Local request-trigger runner behavior for missing workflow, missing trigger, successful invocation/run lookup, and disabled workflow rejection.
- Unsupported Logic workflow child/action routes, including trigger run and versions routes, fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create a Logic workflow resource.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Logic Apps workflow control-plane lifecycle, local parameter rejection cases, local request-trigger runner success and failure behavior, unsupported route boundaries, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Logic Apps is `cloudValidated` for connector execution, Azure-hosted trigger runtime behavior, retries, full run history, long-running orchestration, RBAC, private link, throttling, or exact Azure workflow data-plane behavior.
