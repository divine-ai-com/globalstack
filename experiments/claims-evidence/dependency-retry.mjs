// Only provider download outages are retryable. Never repeat deployment stages,
// or retry checksum, signature-validation, configuration or permission failures.
export function retryableDependencyFailure(label, exitCode, stderr) {
  return label === 'init' && exitCode !== 0 && exitCode !== null
    && /Error: Failed to install provider/.test(stderr)
    && /(?:\b(?:502|503|504)\b|429 Too Many Requests|connection reset by peer)/i.test(stderr)
    && !/checksum.*(?:mismatch|does not match)|invalid signature|signature verification failed|permission denied/i.test(stderr);
}
