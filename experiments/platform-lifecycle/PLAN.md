# Native platform lifecycle comparison

The coverage list is the nine entries in the Azure platform registry. Each entry receives its own unchanged-source local/Azure pair and actual native tool commands. One empty resource group is the first common scenario; it does not establish service or event-flow compatibility.

| Platform | Native lifecycle | State operations |
| --- | --- | --- |
| Terraform HCL | version, format, init, validate, plan, apply, refresh, update, drift repair, destroy | remove and import |
| OpenTofu HCL | version, format, init, validate, plan, apply, refresh, update, drift repair, destroy | remove and import |
| Pulumi TypeScript | version, dependency install, stack init, preview, up, refresh, update, drift repair, destroy | export, forget and import |
| Pulumi Python | same Pulumi lifecycle with its Python runtime | export, forget and import |
| Pulumi YAML | same Pulumi lifecycle with its YAML runtime | export, forget and import |
| Ansible YAML | version, syntax check, check mode, present, repeat, update, drift repair, absent | no Terraform-style state/import |
| Azure CLI REST | version, shell syntax, create, read, repeat, update, drift repair, delete | no declarative state/import |
| Bicep | version, compile, deploy compiled subscription template, inspect deployment, update, drift repair, delete group and deployment record | deployment records, not Terraform state |
| ARM JSON | validate JSON, deploy subscription template, inspect deployment, update, drift repair, delete group and deployment record | deployment records, not Terraform state |

The two targets use matching source hashes, tool image and dependency versions. Endpoint routing and credentials remain external. Shared token acquisition is outside the parity claim. Native reads/writes and direct test probes are recorded separately. Each command retains start/end UTC times, arguments, exit status, bounded sanitized output and observed API exchanges. A missing command or request is never presented as observed.

Portal screenshots are required before treating each new Azure pair as complete. Capture the real resource overview after creation, updated tags after update, and absence after deletion where the portal provides a stable view. Link each image to the platform, run, resource identifier, UTC capture time and file digest. Record redactions explicitly and preserve restricted originals outside Git. API evidence remains necessary for lifecycle actions invisible in the portal. No recreated dashboard substitutes for an Azure Portal screenshot. A signed-in controllable browser must be available before creating resources for screenshot capture.

Use one active live case at a time, immediate finally cleanup, an independent cleanup watchdog, and at least 40 GiB free. The total authorized pilot ceiling remains USD 100. Start with empty groups and scoped deployment records. No paid service resources or additional model/API credits are needed for this phase. Confirm cleanup before starting the next case. Browser waits have a deadline and must not leave resources running indefinitely.

Do not generalize the earlier Terraform pass to other clients. Retain local or Azure failures with their stage and cause, fix shared runtime behavior where supported, and rerun the same immutable source. Preserve the distinction between product fixes and harness fixes. Keep the initial failed attempts separate from corrected pairs. The earlier research release and manuscript remain unchanged until the new results are reviewed.
