# Local document ingress readiness

The new ingress Container App module deployed locally from its compiled Bicep template. Its native process reached `running` and returned HTTP 200 from `/health` through a direct internal readiness check. The same disposable run also completed the existing clean-document worker path through both Search indexes. All local containers were removed.

The health check did not traverse the Container App authentication front door or call the document API. Document ownership was still registered by the harness. The private run report is `reports/production-scenarios/local-document-ingress-health-retry-20261110/result.json`; this public summary omits identifiers and raw logs. The source revision was `85ed2e7`. Authenticated ingress behavior and live Azure comparison remain open.
