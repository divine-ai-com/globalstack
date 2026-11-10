# Production document event setting failures

Two clean-source local runs captured the first production Function exception after a harmless Blob upload. The first reached the `documentUploaded` handler and failed because `QUARANTINE_CONTAINER` was absent. The next run sourced quarantine and projection container names from the deployed data module. The same handler then failed because `SCANNER_ENDPOINT` was absent. Both runs kept the restricted SQL diagnostic and Blob upload passing. Disposable containers were removed after each run.

These observations come from the native worker's private bounded logs. Only the error names are published here. They establish the immediate local configuration failures, not Azure parity or a complete document workflow. The next step is to deploy the scanner and set its endpoint and audience from deployed outputs, then rerun on both targets. See [issue #91](https://github.com/divine-ai-com/globalstack/issues/91).
