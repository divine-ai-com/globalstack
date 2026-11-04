# Google API Foundation

This package contains provider-generic Google API plumbing:

- ADC access-token lookup
- authenticated REST request execution
- common request/response capture shape

It must not contain individual service APIs. Keep service APIs under
`gcp/src/services/<service>/` so each service can evolve independently.

HTTP clients in this package use bounded request timeouts. Emulator hangs are
treated as product gaps to investigate, not as acceptable long-running tests.
