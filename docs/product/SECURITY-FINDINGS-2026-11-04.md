# November 4 static-analysis review

This record covers the 41 open findings on main revision `44807cbad6be7acdf50fe400788e8eab34d28b80`, the additional findings reported on PR 15, and manual follow-up. Alert numbers refer to this repository's GitHub code-scanning inventory. The original severity checker missed query-pack metadata; its zero-high summary was invalid. PR 15 fixes the checker without lowering its threshold or excluding files.

## High and critical findings

| Alerts | Review and change |
|---|---|
| 9, 43 | The storage proxy accepted request-controlled URLs. Its transport hostname and port now come only from operator configuration. Absolute URLs, protocol-relative paths and backslashes are rejected; redirects are not followed. Request and response buffers are limited to 8 MiB. Tests use a separate receiver to prove it receives no requests. Binary response bytes are preserved. |
| 14 | The native HCL helper disabled TLS verification for a generated local certificate. It now trusts that specific certificate and enables verification. |
| 15 | Azure Files allocated buffers from request sizes without a bound. It now limits each file to 16 MiB and total stored file content to 64 MiB by default, with explicit constructor overrides. Tests cover oversized allocation, aggregate limits, deletion and replacement. These limits do not bound every metadata object or concurrent request. |
| 16–18 | Authorization parsing used patterns with avoidable backtracking. Linear token-shaped patterns replace them. Existing malformed-token tests remain active. |
| 37–38 | GCP Storage used a predictable temporary directory. Default stores now use a unique private directory, with disposal limited to the directory they own. Explicit operator paths remain supported. |
| 39–41, 44–45 | The reported sensitive calls were error-response builders or the choice between Shared Key and SAS validation. Builders are named for their response role, and `validateSharedKey` identifies the scheme it validates. Both storage branches still validate credentials. Manual review separately found that Key Vault accepted arbitrary nonempty bearer tokens; it now checks the local identity token. Regression tests prove arbitrary tokens are rejected. The known local development identity is not a production authorization boundary. |
| 1–2 | Removing comments and code fences could join fragments into new markup. Policy parsers now replace removed spans with spaces. |
| 3–6 | Markdown cell escaping was incomplete. A shared single-pass encoder escapes HTML, table delimiters, backslashes and line breaks together. |
| 7–8 | Chained entity decoding could decode the same input more than once. Decoders now perform one pass. This bounds decoding behavior; the WAF remains a limited local model, not a production filtering product. |

## Medium findings

| Alerts | Data path, disposition and boundary |
|---|---|
| 10 | IoT twin merge could traverse prototype properties. Prototype keys are rejected. Manual follow-up found the same class of issue in Digital Twins JSON Patch, which now rejects those paths and traverses only own properties. HTTP regressions cover both services. |
| 11–13 | Internal exception messages could reach HTTP clients. Services now use generic internal errors and explicit public validation messages. The proxy returns a generic backend error. Fault-injection tests verify internal details do not appear in responses. |
| 19 | A user-selected service-account JSON supplies the token endpoint and signing material to the explicit credential-check command. Token exchange is intentional. Redirects are now rejected, requests time out, and remote error bodies are not printed. Only trusted credential files should be used. No live credential exchange was executed in this review. |
| 20–21 | GCP capture configuration supplies project/location fields to explicit Google API calls. This is intended capture behavior. Redirects are rejected and recorded authorization headers are redacted. Tests verify both properties. This client is not a general outbound-network sandbox. |
| 22–23 | GCP storage replay reads the checked-in capture and sends selected fields to a test-owned loopback runtime. The destination comes from that server, not the fixture. The two flagged calls exercise multipart upload and storage layout. This is intentional fixture replay. |
| 25–28 | Azure expectation tests read checked-in fixtures and send request paths or JSON to `node:http` with a fixed `127.0.0.1` hostname and test-owned port. This client does not follow redirects. These are intentional local replay paths. |
| 30 | The demo reads its checked-in managed-identity template and deploys it to a loopback endpoint. Non-loopback hosts are rejected, and redirects are now rejected as well. Source-archive and container demos verify deployment and cleanup. |
| 24, 29 | Optional model-generation commands intentionally send selected prompt files to their fixed model-provider endpoint. They require API credentials and are not invoked by local preview validation. Do not run these commands with private prompts without authorization. Their presence is not evidence that model calls occurred in this review. |
| 34–35 | The complex bundle generator writes returned model text to a raw-response file and a generated source file at application-selected paths. This is its stated purpose, not a remote-selected filename. Generated source is untrusted executable material and requires review and isolated execution. No model generation was run. |
| 31–33, 36 | Explicit Azure capture commands serialize response status and other observations to application-selected JSON fixture/report paths. The traced network data controls file content, not the output path. These writes are intentional. This conclusion does not certify that every capture body is free of sensitive data; capture-wide privacy review remains a release limitation. |

Intentional data flows remain visible to static analysis. They are documented here rather than hidden with directory exclusions. A passing high/critical gate is not a claim of zero findings or a complete security audit.

Finding 42 is the same fixture-to-loopback pattern for the pinned Microsoft Quickstart templates. It was previously dismissed with the path-specific rationale in [the security review](SECURITY-REVIEW.md). It remains present in the raw SARIF report, so raw and open-alert counts differ by one.

## Additional manual findings

Storage authentication debug output included supplied and expected signatures plus the string to sign. Those values and request-specific headers, paths and query strings have been removed from that diagnostic. The remaining diagnostic reports only failure, method and scheme names.

The storage proxy uses a fixed configured transport destination and does not follow redirects. Operators must still choose a trusted backend and run the emulator on an isolated development host. Other outbound integrations, optional runtime engines and generated code require their own isolation review.

## Merge and release procedure

Read the complete final diff and all PR comments, including bot threads. Check the full SARIF artifact and the main-branch inventory because PR annotations can omit existing findings. Require checks on the final head revision, then inspect the post-merge scan before publication. Record scan revisions and remaining findings in the release evidence. Do not count a quota-limited bot review as completed.
