# Third-party notices

GlobalStack's own source is licensed under Apache-2.0. Dependencies and fixtures retain their own licenses. Keep each installed dependency's license and copyright files when distributing source, tools, or container images. This file records the additional license review for the locked Pulumi TypeScript sample; it is not a complete license inventory for every optional backend or operating-system package.

## Pulumi TypeScript sample dependencies

The sample lockfile retains package origins and integrity hashes. Dependency security CI checks known vulnerabilities and license metadata. The following license policy additions were reviewed for this development toolchain on 2026-11-04:

- **BlueOak-1.0.0:** retain the license text or its [canonical link](https://blueoakcouncil.org/license/1.0.0) with redistributed copies. This applies to the locked packages listed below. Individual package notices and separately licensed bundled components still apply.
- **Python-2.0:** `argparse` 2.0.1 retains its upstream `LICENSE`, including the Python license and copyright notices. GlobalStack does not modify that package. See the [license text](https://spdx.org/licenses/Python-2.0.html) and [package source](https://github.com/nodeca/argparse).
- **CC-BY-3.0, scoped data exception:** `spdx-exceptions` 2.5.0 contains SPDX exception identifiers. The upstream attribution is: Copyright © 2010-2015 Linux Foundation and its Contributors. The package was assembled by Kyle Mitchell from the SPDX specification. GlobalStack uses the package unchanged. Retain its README attribution and the [CC-BY-3.0 license](https://creativecommons.org/licenses/by/3.0/) when redistributing it. [Package source](https://github.com/kemitchell/spdx-exceptions.json). This review does not imply endorsement by the Linux Foundation, SPDX, or the package author. CI permits this exact package version; other CC-BY dependencies still require review.

| Blue Oak package | Locked version |
|---|---|
| @isaacs/nonrecursive-glob-match | 1.0.3 |
| chownr | 3.0.0 |
| common-ancestor-path | 2.0.0 |
| glob | 14.0.3 |
| isexe | 4.0.0 |
| lru-cache | 11.5.3 |
| minimatch | 11.0.4 |
| minipass | 7.1.3 |
| minipass-flush | 1.0.7 |
| path-scurry | 3.0.0 |
| tar | 7.5.22 |
| yallist | 5.0.0 |

The vulnerability threshold was not lowered and no advisory was exempted. License approval does not waive attribution, notice retention, or downstream distribution obligations.

## Microsoft Quickstart fixtures

The three pinned fixtures in `fixtures/upstream/azure-quickstarts/` retain their original bytes and the accompanying MIT license. Their source revision and SHA-256 digests are in `provenance.json` in that directory.

## Native research toolchain

The claims experiment source is covered by the repository Apache-2.0 license. Its tool binaries are downloaded separately and retain upstream terms. No Terraform or provider binary is included in the research source archive.

- Terraform 1.17.1: HashiCorp, [versioned license](https://github.com/hashicorp/terraform/blob/v1.17.1/LICENSE). The Docker recipe pins the upstream Linux x86_64 image digest.
- Azure AzAPI provider 2.13.0: Microsoft and contributors, [versioned license](https://github.com/Azure/terraform-provider-azapi/blob/v2.13.0/LICENSE). The included lockfile records provider checksums; initialization downloads the provider.

The private corpus ancestry and exact imported bundle digests are recorded in `experiments/claims-evidence/ORIGIN.json`. The imported source is an authored reference refinement of an internally maintained task; it does not include a third-party application repository or claim human-only authorship. Historical model labels are provenance, not new evaluation results.
