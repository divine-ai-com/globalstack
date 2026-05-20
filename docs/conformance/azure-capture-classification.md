# Azure Capture Classification

This report prevents shallow real-Azure captures from being interpreted as service parity.

- Fixtures: 455
- Cleanup verified: 455
- Cloud-validated operations: 0

## Validation Depth

| Depth | Count |
|---|---:|
| arm-surface | 62 |
| capture-infrastructure-gap | 8 |
| provider-accepted | 98 |
| provider-routing-or-parent-validation | 137 |
| provider-validation | 142 |
| subscription-or-provider-readiness | 8 |

## Caveat

`subscription-or-provider-readiness` captures, such as `MissingSubscriptionRegistration`, are useful evidence but do not prove provider-level semantics. Register the provider or enable the service, then rerun those cases before using them for emulator parity.

