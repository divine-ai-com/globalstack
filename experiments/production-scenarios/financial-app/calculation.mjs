const SCALE = 1_000_000n;
const DECIMAL = /^-?(?:0|[1-9]\d{0,23})(?:\.(\d{1,6}))?$/;
const UNITS = new Set(['ones', 'thousands', 'millions', 'billions']);

function amount(value) {
  if (typeof value !== 'string' || !DECIMAL.test(value)) throw new Error('Amount must be a bounded decimal string');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const scaled = BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
  return negative ? -scaled : scaled;
}

function decimal(value) {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const fraction = String(magnitude % SCALE).padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${magnitude / SCALE}${fraction ? `.${fraction}` : ''}`;
}

function citedOperand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A cited operand is required');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('A three-letter currency is required');
  if (!UNITS.has(input.unit)) throw new Error('A declared unit is required');
  if (typeof input.period !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/.test(input.period)) {
    throw new Error('A bounded source period is required');
  }
  const citation = input.citation;
  if (!citation || typeof citation.documentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(citation.documentId)
    || !Number.isSafeInteger(citation.page) || citation.page < 1) {
    throw new Error('Each operand requires a document and page citation');
  }
  return { ...input, scaled: amount(input.value), citation: { documentId: citation.documentId, page: citation.page } };
}

function compatible(left, right) {
  if (left.currency !== right.currency || left.unit !== right.unit) {
    throw new Error('Currency and unit must match');
  }
}

// All operations use fixed-point integers. Percentage change is rounded to
// six decimal places, with half ties away from zero.
export function calculateFinancialMetric({ operation, operands } = {}) {
  if (!Array.isArray(operands) || operands.length !== 2) throw new Error('Exactly two cited operands are required');
  const [left, right] = operands.map(citedOperand);
  compatible(left, right);
  if (!['add', 'subtract', 'percentageChange', 'percentageOf'].includes(operation)) throw new Error('Unsupported financial operation');
  const citations = [left.citation, right.citation];
  if (operation === 'percentageChange' || operation === 'percentageOf') {
    if (operation === 'percentageChange' && left.period === right.period) throw new Error('Current and previous periods must differ');
    if (operation === 'percentageOf' && left.period !== right.period) throw new Error('Periods must match for a percentage');
    if (right.scaled === 0n) throw new Error('Denominator must be nonzero');
    const numerator = (operation === 'percentageChange' ? left.scaled - right.scaled : left.scaled) * 100n * SCALE;
    const denominator = right.scaled < 0n ? -right.scaled : right.scaled;
    const magnitude = numerator < 0n ? -numerator : numerator;
    const rounded = (magnitude + denominator / 2n) / denominator;
    return { operation, value: decimal(numerator < 0n ? -rounded : rounded), unit: 'percent',
      currency: left.currency,
      ...(operation === 'percentageChange' ? { periods: { current: left.period, previous: right.period } } : { period: left.period }),
      citations };
  }
  if (left.period !== right.period) throw new Error('Periods must match for arithmetic');
  return { operation, value: decimal(operation === 'add' ? left.scaled + right.scaled : left.scaled - right.scaled),
    unit: left.unit, currency: left.currency, period: left.period, citations };
}
