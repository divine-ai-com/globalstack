# Azure Capture Classification

This report prevents shallow real-Azure captures from being interpreted as service parity.

- Fixtures: 680
- Cleanup verified: 680
- Cloud-validated operations: 0

## Validation Depth

| Depth | Count |
|---|---:|
| arm-surface | 84 |
| capture-infrastructure-gap | 215 |
| provider-accepted | 98 |
| provider-routing-or-parent-validation | 128 |
| provider-validation | 149 |
| subscription-or-provider-readiness | 6 |

## Caveat

`subscription-or-provider-readiness` captures, such as `MissingSubscriptionRegistration`, are useful evidence but do not prove provider-level semantics. Register the provider or enable the service, then rerun those cases before using them for emulator parity.

