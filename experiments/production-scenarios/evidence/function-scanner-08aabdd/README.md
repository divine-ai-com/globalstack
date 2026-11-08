# Native Functions handler to scanner

Clean source revision: `08aabdd115d28ae4b74032b8fe615ed914bcad25`.

The actual Functions HTTP handler obtained a managed-identity token and called
the native scanner. Missing host authentication returned 401. Authorized input
returned 200 with matching input and scanned-content hashes. Revoking scanner
access returned 403, and restoration returned 200. The five container SDK checks
also passed. Cleanup removed both native workloads and their transport resources.

This is local component evidence, not an Azure paired result, Event Grid
delivery, Durable orchestration, or completion of the document workflow. The
compiled templates and exact image IDs are retained in the report. Host keys
and workload tokens are not included.
