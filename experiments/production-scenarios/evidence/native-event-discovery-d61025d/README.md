# Native Event Grid Function discovery diagnostic

A clean-source local run of the official Functions container discovered `documentUploaded` from the host, created a Storage system-topic subscription without a `Microsoft.Web/sites/functions` PUT, uploaded a Blob, and observed one invocation. The invocation failed with HTTP 500 because this diagnostic deliberately omits downstream application settings. It is proof of event delivery and fail-closed application behavior, not proof of a complete document workflow or Azure parity.

Reproduce with `FUNCTIONS_PROBE_ORCHESTRATION=1 FUNCTIONS_PROBE_NATIVE_ROUTING=1 FUNCTIONS_PROBE_NATIVE_EVENTS=1 node experiments/production-scenarios/functions-storage-probe.mjs`. The probe writes detailed private logs under `reports/production-scenarios/` and removes its container and network. The result here contains only bounded, non-secret observations from that run.
