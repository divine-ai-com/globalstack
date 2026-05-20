# Azure Capture Classification

This report prevents shallow real-Azure captures from being interpreted as service parity.

- Fixtures: 752
- Cleanup verified: 752
- Cloud-validated operations: 0

## Validation Depth

| Depth | Count |
|---|---:|
| arm-surface | 84 |
| capture-infrastructure-gap | 331 |
| provider-accepted | 93 |
| provider-routing-or-parent-validation | 122 |
| provider-validation | 116 |
| subscription-or-provider-readiness | 6 |

## Caveat

`subscription-or-provider-readiness` captures, such as `MissingSubscriptionRegistration`, are useful evidence but do not prove provider-level semantics. Register the provider or enable the service, then rerun those cases before using them for emulator parity.

