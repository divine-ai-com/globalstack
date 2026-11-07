# Document scanner worker

This is an application component under development, not a completed Azure or
GlobalStack deployment. The same image is intended for both targets. It has no
emulator flag and performs actual ClamAV/YARA scanning and extraction. The HTTP
worker starts one non-root ClamAV daemon with a private mode-0600 Unix socket.
No ClamAV TCP listener is enabled. `clamdscan --stream` sends each immutable
input to the shared engine; YARA remains an independent subprocess.

`POST /scan` accepts a length-delimited document with its content type. Both
engines inspect the same immutable temporary bytes. Detection prevents
extraction. An unavailable engine, missing database, malformed input or failed
extraction produces an unresolved result with no searchable text. Supported
types are UTF-8 TXT, text/image PDF and DOCX. PDF results retain physical page
numbers. DOCX results retain section provenance with `page: null`; XML text
extraction cannot establish rendered page numbers.

Limits are 10 MiB input, 20 PDF pages, 50 MiB expanded archive content and 2 MiB
extracted text. Child commands have CPU, output-file and wall-clock bounds.
The HTTP listener admits 16 connections and two active processing requests.
The daemon has two scan threads, a queue of four, a 15-second scan limit and the
same file/expansion limits. Engine initialization has a 90-second deadline.
Readiness requires both the initial two-engine check and a responsive daemon.
Daemon loss returns unresolved scans with no extracted text; there is no silent
fallback to another engine/database. Graceful shutdown terminates and reaps the
daemon.
Container memory, PIDs and temporary storage must also be bounded by the runner.
The listener is internal. Identity, private ingress and caller authorization
must be deployed and tested before exposing it in either full scenario.

The image deliberately contains no downloaded signature database. Supply a
frozen ClamAV database at `/var/lib/clamav`, retain its hashes and engine version,
and mount it read-only. Missing signatures fail closed. The included YARA rule
detects only a harmless pilot marker. It is original test content, not a claim
of production malware-rule coverage or corporate security certification.
The tests likewise build an explicit harmless ClamAV signature and invoke the
real engine. Freeze the selected vendor/rule data before a paired deployment.

Build and run local component tests:

```sh
docker build -t globalstack/document-scanner:pilot experiments/production-scenarios/document-app/scanner
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 1g --cpus 2 --pids-limit 64 --tmpfs /tmp:rw,nosuid,nodev,size=268435456 \
  -v "$PWD/experiments/production-scenarios/document-app/scanner:/app:ro" \
  globalstack/document-scanner:pilot python /app/test_worker.py
```

The base image is pinned by digest. Debian package versions are resolved at
build time, so a rebuild is not claimed byte-identical. Retain the final image
digest and `dpkg-query` inventory and use that exact image for both targets.
No scanner test is counted as a complete document-pipeline assertion.

The [official-database baseline](../../evidence/scanner-vendor-2c9f2f4/) uses the
same 2-vCPU/4-GiB bounds intended for the pilot scanner. Four sequential checks
passed, but one of two concurrent clean scans timed out while each request
loaded its own ClamAV engine. This is why the HTTP worker now shares a loaded
engine. The local tests additionally exercise HTTP readiness after engine loss
and process cleanup. A complete application performance result is still absent.
Vendor database bytes are retained in the operator workspace; a later FreshClam
download may differ despite the recorded versions and hashes.

The one-shot binary tests use a small harmless fixture database and need 1 GiB.
Use 4 GiB for the official database run, with the same frozen database mounted
read-only on both targets. Do not perform automatic signature refresh during a
paired run. Refresh and revalidate outside the frozen experiment.

References: [ClamAV daemon and one-shot scanning](https://docs.clamav.net/manual/Usage/Scanning.html),
[signature management](https://docs.clamav.net/manual/Usage/SignatureManagement.html),
and [official memory guidance](https://docs.clamav.net/manual/Installing/Docker.html).

The [subsequent HTTP capture](../../evidence/scanner-daemon-cd26108/) retains the
same signature provenance and 2-vCPU/4-GiB bounds. Engine startup took 17.9 seconds.
Six warmed scans, including two concurrent requests, took 36-85 ms and returned
the expected clean/detected decisions. Deliberately terminating the engine made
readiness return 503 and the next scan unresolved without searchable text.
Seven scan responses match logged correlation IDs, content hashes and decisions.
The daemon and container were removed. This single local diagnostic is not a
latency distribution or an Azure result; the baseline called the worker directly,
while the new capture includes HTTP overhead.

Reproduce inside the built scanner image with the frozen database read-only:
mount this directory at `/fixtures`, a writable result directory at `/evidence`,
and the signature directory at `/var/lib/clamav`. Set `PYTHONPATH=/app:/fixtures`
and run `python /fixtures/probe_vendor_http.py --output /evidence --image-id <actual-image-id> --revision <source-commit>`.
Use the same resource/security limits as the baseline, increasing memory to
4 GiB for official signatures. The probe runs the unmodified `/app/server.py`,
keeps startup and warmed measurements separate, and deliberately kills only its
own child engine for the failure test.
