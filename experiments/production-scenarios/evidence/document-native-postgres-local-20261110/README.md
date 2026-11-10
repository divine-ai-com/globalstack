# Native Functions to PostgreSQL local check

The clean-source local run compiled the host, PostgreSQL-identity and worker-app
Bicep modules, started the document Functions image and an isolated PostgreSQL
backend, and invoked the worker's opt-in database diagnostic with its native
host admin key. The Functions process obtained a managed-identity token for
PostgreSQL. GlobalStack's TLS gateway accepted that token as the restricted
`worker-pilot` database login. The diagnostic returned HTTP 200, role
`worker-pilot` and zero document access rows. One accepted PostgreSQL
connection was observed. The worker and database containers were removed.

[summary.json](summary.json) records the clean source revision, image ID,
compiled template hashes, observed result and a SHA-256 of the private report.
The private report contains generated resource identifiers and remains in the
operator workspace. This check did not run on Azure and did not process a Blob
event or reach the scanner, Search or Service Bus. It does not establish a
complete document workflow or general PostgreSQL compatibility.
