# Azure Capture Classification

This report prevents shallow real-Azure captures from being interpreted as service parity.

- Fixtures: 890
- Cleanup verified: 890
- Cloud-validated operations: 0

## Validation Depth

| Depth | Count |
|---|---:|
| arm-surface | 88 |
| capture-infrastructure-gap | 331 |
| provider-accepted | 97 |
| provider-routing-or-parent-validation | 127 |
| provider-validation | 214 |
| subscription-or-provider-readiness | 33 |

## Caveat

`subscription-or-provider-readiness` captures, such as `MissingSubscriptionRegistration`, are useful evidence but do not prove provider-level semantics. Register the provider or enable the service, then rerun those cases before using them for emulator parity.

