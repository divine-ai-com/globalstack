# Document scanner worker

This is an application component under development, not a completed Azure or
GlobalStack deployment. The same image is intended for both targets. It has no
emulator flag and performs actual ClamAV/YARA subprocess calls and extraction.

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
