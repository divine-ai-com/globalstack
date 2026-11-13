# PostgreSQL validation after the bounded local fix

At source revision `38e1f19`, Azure and GlobalStack each returned HTTP 200 for provider-level validation of the same compiled Entra-only PostgreSQL template. Azure resource inventory was empty afterward, and the validation deployment record was absent. The sanitized responses are in `result.json`.

This result covers only the captured pilot template and validation API. No PostgreSQL server was deployed, no SQL schema was initialized, and the worker did not connect. Live creation and teardown must be tested before claiming deployment parity.
