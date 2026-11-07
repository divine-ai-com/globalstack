# Recorded native lifecycle pairs

All nine registered platform implementations completed the same empty-resource-group lifecycle against GlobalStack and Azure on 2026-11-07. Each retained pair used matching fixture hashes and a pinned native tool image. This establishes successful execution of this lifecycle only. It does not establish application event-flow, authentication or general Azure compatibility.

| Platform | Local command stages | Azure command stages | Local ARM exchanges | Azure ARM exchanges | Unmatched exchanges |
| --- | ---: | ---: | ---: | ---: | ---: |
| azure-terraform-hcl | 16 | 16 | 20 | 21 | 1 |
| azure-opentofu-hcl | 16 | 16 | 20 | 21 | 1 |
| azure-pulumi-ts | 24 | 24 | 14 | 15 | 1 |
| azure-pulumi-py | 24 | 24 | 14 | 15 | 1 |
| azure-pulumi-yaml | 23 | 23 | 14 | 15 | 1 |
| azure-ansible-yaml | 12 | 12 | 23 | 25 | 2 |
| azure-cli-rest | 10 | 10 | 8 | 8 | 0 |
| azure-bicep | 15 | 16 | 12 | 13 | 1 |
| azure-arm-json | 14 | 14 | 12 | 12 | 0 |

[Retained evidence](evidence/live/index.json) includes per-run revisions, SHA-256 digests, sanitized native results, comparisons and contemporaneous terminal events. Lifecycle checks include create, repeat, update, drift repair, supported state/import operations and destruction. Every pair verified resource absence and removal of private runtime files. Bicep and ARM also verified deletion of owned deployment-history records.

The live WebM recordings remain in the operator workspace, with their hashes and recording metadata retained here. Videos are not included in Git. The public event streams can be used to reconstruct terminal playback, but reconstructed playback must not be described as a new live recording. Portal screenshots remain pending for all nine platforms.

API behavior is not identical. For example, resource-group deletion is synchronous locally (HTTP 200) and asynchronous on Azure (HTTP 202), with additional Azure polling. The comparison retains response and selected-header differences rather than converting lifecycle success into a compatibility percentage. Identity token acquisition and package downloads are outside the ARM capture scope.

Terraform and OpenTofu were captured at revision `1bc474a3c3623acf61dee3ddf33cc2ce86d02dbc`. The other seven were captured at `0ed293215f9990d28574cced7f66f0b3678a234f`, which restricts terminal rendering to known panels. Neither fixture source nor emulator behavior changed between these two revisions. Failed historical development attempts remain separate from these final pairs.
