# Research harness static-analysis review

The complete initial PR 17 scan contains 26 medium findings and zero high or critical findings. Nineteen belong to the previously reviewed source; seven are introduced by the public research harness. The new findings were reviewed by following the SARIF data paths, not inferred safe from the passing severity gate. This is a maintainer review, not an external security audit.

| Alerts | Traced flow | Disposition and boundary |
|---|---|---|
| 48–50 | The behavioral entry point reads its context file and uses endpoint and synthetic payload fields in HTTP requests. | This is the intended local test protocol. Context is written by the harness in a new private run directory. Endpoints must be HTTP on `127.0.0.1` with an explicit port and no URL credentials. Observation and publish requests reject redirects; the new regression proves a redirect target receives no request. The storage client signs local storage operations. Only trusted, harness-generated contexts are supported; the module path in the context is not an untrusted extension boundary. |
| 51 | Checked-in resource metadata supplies paths and bodies to management requests. | The destination origin comes from a test-owned loopback server, not the fixture. Requests reject redirects and have a timeout. Resource names and payloads are synthetic. This is fixture replay, not a general outbound request service. |
| 52–53 | Loopback response observations are serialized into attempt/result files. | File paths are fixed names under an exclusive run directory. Network data controls content, not filenames. Capturing these observations is the experiment's purpose. Results must still be reviewed before release; an unrestricted capture sanitizer is not claimed. |
| 54 | Locally generated storage and event keys are written to the behavioral context. | The context is a temporary file written with mode 0600 inside a new mode-0700 run directory. It is explicitly excluded from archived evidence and deleted after success or handled failure. An injected image failure verifies cleanup; an existing output directory is rejected. Abrupt host/process termination can prevent cleanup, so these local fixtures are not a secret-management service. |

The alerts remain visible. No query, directory or severity threshold was disabled. CodeQL does not establish the absence of vulnerabilities or production isolation. The local emulator remains intended for trusted development workloads.

The secret scanner separately flagged the expression assigning `topicKeys.body.key1` to a variable. This is code, not a credential value. The exact commit/path/line fingerprint was reviewed. Synthetic UUID Table row identifiers in retained traces are reviewed by the same narrow fingerprint process. These exceptions do not exclude future files or disable generic-key detection.

The harness uses a pinned external Terraform tool image and downloads the pinned AzAPI provider. Neither tool is included in the research source archive or relicensed by the root Apache-2.0 license. See [third-party notices](../../THIRD_PARTY_NOTICES.md).
