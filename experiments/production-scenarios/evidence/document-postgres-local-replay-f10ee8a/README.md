# PostgreSQL local replay after the creation fix

At source revision `f10ee8a`, the local runner reconstructed the exact request body retained from the earlier Azure PostgreSQL deployment. It verified that the sanitized request matched the original Azure PUT, then submitted it to GlobalStack. The local deployment returned HTTP 201 and `Succeeded`; subsequent reads returned HTTP 200 for the server, Entra administrator and `documents` database. The local resource group was removed.

The earlier Azure deployment also began with HTTP 201 and ended `Succeeded`. This is a bounded control-plane creation result for one template. It does not compare response bodies in full, execute SQL, prove managed-identity database access, validate network isolation, or complete the document workflow. The original Azure first-pass cleanup failure and later recovery remain separately recorded.
