# Scanner ingress comparison

This run deployed identical compiled templates and the frozen scanner image to Azure and the native local runtime. Negative status controls matched. All three positive scanner requests returned Azure 403 and local 200 after an accepted caller-policy update. The cause remains unresolved.

The original result preserves the 15-minute Azure environment-deletion timeout. Local workers were removed. Cleanup recovery is recorded separately; this capture alone does not establish cloud resource absence. The complete business pipeline and worker-to-scanner access were not tested.

The event stream is a sanitized recording of actual HTTP exchanges. Angle-bracket account identifiers are redactions applied after requests, not literal request values. Timestamps, statuses and provider error bodies are retained.
