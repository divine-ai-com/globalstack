function policyKey(policyName) {
  return String(policyName).toLowerCase();
}

function headersFromRequest(request) {
  const headers = new Map();
  for (const [key, value] of Object.entries(request?.headers ?? {})) {
    headers.set(key.toLowerCase(), String(value));
  }
  return headers;
}

function requestValue(matchVariable, request) {
  const variableName = matchVariable?.variableName;
  if (variableName === 'RequestHeaders') {
    return headersFromRequest(request).get(String(matchVariable?.selector ?? '').toLowerCase()) ?? '';
  }
  if (variableName === 'RequestUri') return request?.uri ?? request?.path ?? '';
  if (variableName === 'RequestMethod') return request?.method ?? '';
  return '';
}

function conditionMatches(condition, request) {
  const values = condition?.matchValues ?? [];
  if (!Array.isArray(values) || values.length === 0) return false;
  const operator = condition?.operator;
  const negated = condition?.negationCondition === true || condition?.negationConditon === true;
  const matched = (condition?.matchVariables ?? []).some(matchVariable => {
    const candidate = requestValue(matchVariable, request).toLowerCase();
    return values.some(value => {
      const expected = String(value).toLowerCase();
      if (operator === 'Contains') return candidate.includes(expected);
      if (operator === 'Equals') return candidate === expected;
      if (operator === 'BeginsWith') return candidate.startsWith(expected);
      if (operator === 'EndsWith') return candidate.endsWith(expected);
      return false;
    });
  });
  return negated ? !matched : matched;
}

function ruleMatches(rule, request) {
  const conditions = rule?.matchConditions ?? [];
  return Array.isArray(conditions) && conditions.length > 0 && conditions.every(condition => conditionMatches(condition, request));
}

export class WafEvaluator {
  constructor() {
    this.policies = new Map();
  }

  registerPolicy({ policyName, properties }) {
    this.policies.set(policyKey(policyName), {
      policyName: String(policyName),
      properties: properties ?? {},
    });
  }

  unregisterPolicy(policyName) {
    this.policies.delete(policyKey(policyName));
  }

  evaluate({ policyName, request }) {
    const policy = this.policies.get(policyKey(policyName));
    if (!policy) {
      return {
        action: 'Allow',
        reason: 'PolicyNotFound',
        matchedRules: [],
      };
    }

    const settings = policy.properties.policySettings ?? {};
    if (settings.state === 'Disabled') {
      return {
        action: 'Allow',
        reason: 'PolicyDisabled',
        matchedRules: [],
      };
    }

    const mode = settings.mode ?? 'Detection';
    const rules = [...(policy.properties.customRules ?? [])].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    const matchedRules = rules.filter(rule => ruleMatches(rule, request)).map(rule => ({
      name: rule.name,
      action: rule.action,
      priority: rule.priority,
    }));
    const blockingRule = matchedRules.find(rule => rule.action === 'Block');
    if (blockingRule && mode === 'Prevention') {
      return {
        action: 'Block',
        reason: 'CustomRuleMatch',
        mode,
        matchedRules,
      };
    }

    return {
      action: 'Allow',
      reason: blockingRule ? 'DetectionOnly' : 'NoRuleMatch',
      mode,
      matchedRules,
    };
  }
}

export function createWafEvaluator() {
  return new WafEvaluator();
}
