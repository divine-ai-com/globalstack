# Approval Provider Wave

This report tracks one-by-one validation for provider namespaces that were not registered during low-risk capture.

- Dry run: false
- Register: true
- Allow valid-minimal: true
- Candidate cases: 2
- Failed reruns: 0
- Leftover conformance resource groups: 0

| Namespace | Before | After |
|---|---|---|
| Microsoft.Cache | Registered | Registered |

| Fixture | Variance | Result |
|---|---|---|
| redis-cache.microsoft-cache-redis.createOrUpdate.valid-minimal | valid-minimal | exit 0 |
| redis-cache.microsoft-cache-redisenterprise.createOrUpdate.valid-minimal | valid-minimal | exit 0 |

