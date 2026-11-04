export const supportClasses = Object.freeze({
  unsupported: 'unsupported',
  controlPlaneOnly: 'control-plane-only',
  boundedRuntime: 'bounded-runtime',
  officialEmulatorBacked: 'official-emulator-backed',
  realEngineBacked: 'real-engine-backed',
  differentiallyValidated: 'differentially-validated',
});

export const seriousParityClasses = new Set([
  supportClasses.officialEmulatorBacked,
  supportClasses.realEngineBacked,
  supportClasses.differentiallyValidated,
]);

export function assertSupportClass(value) {
  if (!Object.values(supportClasses).includes(value)) {
    throw new Error(`Invalid GCP support class: ${value}`);
  }
}

export function countsTowardSeriousParity(value) {
  assertSupportClass(value);
  return seriousParityClasses.has(value);
}
