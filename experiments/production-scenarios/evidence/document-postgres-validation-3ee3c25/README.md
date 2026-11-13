# Entra-only PostgreSQL validation

At source revision `3ee3c25`, the same compiled document PostgreSQL template was submitted to Azure and GlobalStack with provider-level validation. Azure returned HTTP 200 and listed the server, Entra administrator and database as validated resources. GlobalStack returned HTTP 501 because PostgreSQL provider validation was not implemented. The sanitized responses and template hash are in `result.json`.

This call did not deploy PostgreSQL. An independent Azure resource inventory remained empty, and no deployment record remained. The follow-up local validator change is bounded to the captured Entra-only pilot shape. It does not prove that Azure and GlobalStack accept the same live deployment, that a managed identity can connect, or that SQL and application behavior match.
