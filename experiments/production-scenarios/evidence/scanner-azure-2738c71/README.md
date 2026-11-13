# Scanner ingress comparison

This run deployed identical compiled templates and the frozen scanner image to Azure and the native local runtime. Negative status controls matched. All three positive scanner requests returned Azure 403 and local 200 after an accepted caller-policy update. The cause remains unresolved.

The original result preserves the 15-minute Azure environment-deletion timeout. Local workers were removed. The separate `cleanup-recovery.json` verifies resources, roles and deployment records absent and the retained group empty at 2026-11-08T10:44:56Z. Environment deletion took about 24 minutes from the first accepted DELETE. The original timeout result is unchanged. The complete business pipeline and worker-to-scanner access were not tested.

The event stream is a sanitized recording of actual HTTP exchanges. Angle-bracket account identifiers are redactions applied after requests, not literal request values. Timestamps, statuses and provider error bodies are retained.
