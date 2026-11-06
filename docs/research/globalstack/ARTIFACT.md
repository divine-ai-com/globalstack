# Reproducing the research artifact

Release identifier: `research-artifact-2026-11-06`. This is a source-only research preview accompanying a technical draft. It is not an arXiv submission or a production-readiness certification. Author names, affiliations and independent review remain pending.

## Obtain a fixed checkout

Use the Git tag rather than a moving branch:

```bash
git clone --branch research-artifact-2026-11-06 --single-branch https://github.com/divine-ai-com/globalstack.git
cd globalstack
npm ci
```

The release also provides a Git bundle for obtaining the same repository without relying on a private repository. Clone that bundle, then check out the release tag. The automatic GitHub source ZIP does not contain Git metadata; the native harness requires a Git checkout to record source provenance. External npm dependencies, the tool image and provider still need downloading or a populated cache.

The root Apache-2.0 license covers contributed project and experiment source. Upstream fixtures retain their notices, and separately fetched tools retain their own licenses. See `THIRD_PARTY_NOTICES.md` and `experiments/claims-evidence/ORIGIN.json`.

## Recompute retained results

```bash
node docs/research/globalstack/render-evidence.mjs
node docs/research/globalstack/render-study.mjs
node docs/research/globalstack/render-claims.mjs
(cd docs/research/globalstack && sha256sum --check SHA256SUMS)
git diff --exit-code
```

These commands verify retained observations and source digests. They do not execute the deployment or authenticate a captured observation independently.

## Run the experiments

For the 12-mutation checker study, with workspace dependencies installed:

```bash
node scripts/e2e/run-flow-study.mjs
```

It writes a new checkpointed report to `dist/flow-study/results.json`. Retain failed and inconclusive attempts. The archived paper sample remains separate.

For the native claims case, use Linux x86_64, Python 3, OpenSSL, Docker and at least 40 GiB free:

```bash
npm run research:claims:build
npm run research:claims:test
npm run research:claims
```

Repeat the last command three times for the three-run design. Each invocation prints its unique results directory. Pass those three result files to `node experiments/claims-evidence/verify.mjs`. See the [experiment instructions](../../../experiments/claims-evidence/README.md) for the exact observation contract, disk guard, cleanup and platform limits. No Azure account or paid model call is used.

The older nine-platform native matrix has its own versions, image recipes and reproduction instructions in [README.md](README.md). It is a separate historical experiment; running the claims case does not rerun that matrix. Image recipes do not freeze every operating-system dependency.

## Map claims to evidence

| Claim | Source and retained evidence |
|---|---|
| Nine native reference configurations completed their recorded stages | `evidence/validation.json`, `evidence/provider-lifecycles.json`; README native-matrix recipe |
| Checking layers reject different selected faults | `study/PROTOCOL.md`, `scripts/e2e/flow-study-*`, `study/evidence/results.json` |
| The checker study repeats from the release source | `study/evidence/public-reproduction.json`; checked against the original vectors without pooling |
| Native provisioning plus observed business behavior | `experiments/claims-evidence/`, `claims/evidence/public-1.json` through `public-3.json` |
| The same native case runs in CI | `claims/evidence/ci-reproduction.json` and its linked workflow provenance |
| Duplicate Table insert was corrected | Storage regression, pre-fix traces, corrected public traces and documented API contract |
| Source provenance and dependencies | `claims/evidence/public-provenance.json`, `experiments/claims-evidence/ORIGIN.json`, provider and npm lockfiles |
| Remaining security findings were reviewed | Complete retained research SARIF and `docs/product/SECURITY-FINDINGS-2026-11-06.md` |

Private corpus statistics are not paper results in this version. The case ancestry does not require access to that corpus to execute the included source. Repeated episodes, CI executions and earlier samples are not added together as independent workloads.

## Paper and citation

The PDF and LaTeX source are in this directory. Rebuild with Tectonic 0.17.0 after running the evidence renderers. The paper uses colored vector figures and the existing Palatino styling. Before formal publication, complete [the readiness checklist](study/READINESS.md).

Until authorship and a persistent scholarly identifier are finalized, cite the software artifact by project title, repository URL, release identifier and access date. Do not invent a paper DOI, author list, acceptance status or independent reproduction claim. The Git tag and release checksum manifest identify this snapshot.
