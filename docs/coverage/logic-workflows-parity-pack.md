# Azure Logic Workflows Parity Pack

This pack is the local acceptance suite for Azure Logic Apps workflow control-plane behavior plus a local request-trigger runner and run-history surface before the Step Functions equivalent moves closer to 99% parity. It does not replace live Azure capture for broad connector execution depth, Azure-hosted trigger runtime behavior, full retry semantics, full run history parity, unbounded long-running orchestration, RBAC, private link, throttling, or exact Azure workflow data-plane behavior.

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
- Local request-trigger runner behavior for missing workflow, missing trigger, successful invocation/run lookup, route-based trigger execution, callback URL generation, trigger-history listing/reset, run listing, run inspection, and disabled workflow rejection.
- Bounded action execution for `Compose`, `Response`, `InitializeVariable`, `SetVariable`, `ParseJson`, `If`, `Foreach`, `Http`, `Delay`, `Until`, `ApiConnection`, and `Terminate` is covered in the local workflow runner.
- `runAfter` dependency handling is enforced locally, including skipped actions when dependency statuses do not match.
- Bounded HTTP retry policy handling is covered for transient failures.
- Bounded long-running workflow behavior is covered through `Delay` plus `Until` progression.
- Bounded connector execution is covered for local `ApiConnection` actions representing blob and App Configuration surfaces.
- Unsupported Logic workflow child/action routes outside the supported trigger/run and run-history subset still fail closed with `GlobalStackResourceTypeNotEmulated`.
- ARM template deployment can create a Logic workflow resource.
- The platform runner matrix still deploys native IaC through the GlobalStack provider route.

## Claim Boundary

Passing this pack means GlobalStack handles the listed Azure Logic Apps workflow control-plane lifecycle, local parameter rejection cases, bounded request-trigger runner success and failure behavior, `runAfter`/conditional/foreach/http/retry/delay/until/api-connection/terminate semantics for the supported action subset, supported trigger/run/callback/history/reset routes, unsupported route boundaries outside that subset, ARM-template deployment path, and representative platform deployment paths correctly in the local emulator. It does not mean Logic Apps is `cloudValidated` for the broader connector catalog, Azure-hosted trigger runtime behavior, full retry parity, full run history parity, unbounded long-running orchestration, RBAC, private link, throttling, or exact Azure workflow data-plane behavior.
