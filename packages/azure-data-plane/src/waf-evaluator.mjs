import { isIP } from 'node:net';

function policyKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function headersFromRequest(request) {
  const headers = new Map();
  for (const [key, value] of Object.entries(request?.headers ?? {})) {
    headers.set(key.toLowerCase(), String(value));
  }
  return headers;
}

function cookieMapFromRequest(request) {
  const cookies = new Map();
  const cookieHeader = headersFromRequest(request).get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.split('=');
    const key = String(rawKey ?? '').trim().toLowerCase();
    if (!key) continue;
    cookies.set(key, rawValue.join('=').trim());
  }
  return cookies;
}

function firstForwardedAddress(request) {
  const header = headersFromRequest(request).get('x-forwarded-for') ?? '';
  return String(header).split(',')[0]?.trim() || request?.remoteAddress || '';
}

function requestQueryString(request) {
  const raw = String(request?.queryString ?? '');
  if (raw) return raw.replace(/^\?/, '');
  const query = String(request?.query ?? '');
  return query.replace(/^\?/, '');
}

function requestBody(request) {
  return String(request?.body ?? '');
}

function applyTransforms(value, transforms = []) {
  let current = String(value ?? '');
  for (const transform of transforms ?? []) {
    switch (String(transform ?? '')) {
      case 'Lowercase':
        current = current.toLowerCase();
        break;
      case 'Uppercase':
        current = current.toUpperCase();
        break;
      case 'Trim':
        current = current.trim();
        break;
      case 'UrlDecode':
        try {
          current = decodeURIComponent(current);
        } catch {
          // Keep the original string when Azure-style URL decode would fail.
        }
        break;
      case 'RemoveNulls':
        current = current.replace(/\0/g, '');
        break;
      case 'HtmlEntityDecode':
        current = current
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>');
        break;
      default:
        break;
    }
  }
  return current;
}

function ipv4ToInt(address) {
  const parts = String(address ?? '').split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map(part => Number.parseInt(part, 10));
  if (octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function ipMatches(candidate, expected) {
  const normalizedCandidate = String(candidate ?? '').trim();
  const normalizedExpected = String(expected ?? '').trim();
  if (!normalizedCandidate || !normalizedExpected) return false;
  if (normalizedExpected.includes('/')) {
    const [base, prefixText] = normalizedExpected.split('/');
    const prefix = Number.parseInt(prefixText, 10);
    const candidateInt = ipv4ToInt(normalizedCandidate);
    const baseInt = ipv4ToInt(base);
    if (candidateInt === null || baseInt === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    return (candidateInt & mask) === (baseInt & mask);
  }
  return normalizedCandidate === normalizedExpected;
}

function operatorMatches(operator, candidate, expected) {
  const operatorName = String(operator ?? '');
  const candidateValue = String(candidate ?? '');
  const expectedValue = String(expected ?? '');
  switch (operatorName) {
    case 'Contains':
      return candidateValue.includes(expectedValue);
    case 'Equal':
    case 'Equals':
      return candidateValue === expectedValue;
    case 'BeginsWith':
      return candidateValue.startsWith(expectedValue);
    case 'EndsWith':
      return candidateValue.endsWith(expectedValue);
    case 'Regex': {
      try {
        return new RegExp(expectedValue, 'i').test(candidateValue);
      } catch {
        return false;
      }
    }
    case 'IPMatch':
      return ipMatches(candidateValue, expectedValue);
    case 'Any':
      return true;
    default:
      return false;
  }
}

function conditionVariables(condition) {
  if (Array.isArray(condition?.matchVariables) && condition.matchVariables.length > 0) {
    return condition.matchVariables;
  }
  if (condition?.matchVariable) {
    return [{
      variableName: condition.matchVariable,
      selector: condition.selector,
    }];
  }
  return [];
}

function requestValues(matchVariable, request) {
  const variableName = String(matchVariable?.variableName ?? '');
  const selector = String(matchVariable?.selector ?? '').toLowerCase();
  if (variableName === 'RequestHeaders') {
    return [headersFromRequest(request).get(selector) ?? ''];
  }
  if (variableName === 'RequestCookies') {
    return [cookieMapFromRequest(request).get(selector) ?? ''];
  }
  if (variableName === 'RequestUri') {
    return [request?.uri ?? request?.path ?? ''];
  }
  if (variableName === 'RequestMethod') {
    return [request?.method ?? ''];
  }
  if (variableName === 'QueryString') {
    return [requestQueryString(request)];
  }
  if (variableName === 'RequestBody') {
    return [requestBody(request)];
  }
  if (variableName === 'RemoteAddr') {
    return [firstForwardedAddress(request)];
  }
  return [''];
}

function conditionMatches(condition, request) {
  const expectedValues = condition?.matchValues ?? condition?.matchValue ?? [];
  const values = Array.isArray(expectedValues) ? expectedValues : [expectedValues];
  const operator = condition?.operator;
  const negated = condition?.negationCondition === true
    || condition?.negationConditon === true
    || condition?.negateCondition === true;
  const transforms = Array.isArray(condition?.transforms) ? condition.transforms : [];
  const variables = conditionVariables(condition);
  if (variables.length === 0) return false;
  const matched = variables.some(matchVariable => requestValues(matchVariable, request).some(candidate => {
    const transformed = applyTransforms(candidate, transforms);
    if (operator === 'Any') return true;
    return values.some(value => operatorMatches(operator, transformed, String(value ?? '')));
  }));
  return negated ? !matched : matched;
}

function normalizePolicySettings(policyType, properties = {}) {
  const settings = properties.policySettings ?? {};
  if (policyType === 'frontdoor') {
    return {
      state: settings.enabledState ?? 'Enabled',
      mode: settings.mode ?? 'Detection',
      redirectUrl: settings.redirectUrl ?? null,
      customBlockResponseStatusCode: settings.customBlockResponseStatusCode ?? 403,
      customBlockResponseBody: settings.customBlockResponseBody ?? null,
    };
  }
  return {
    state: settings.state ?? 'Enabled',
    mode: settings.mode ?? 'Detection',
    redirectUrl: null,
    customBlockResponseStatusCode: 403,
    customBlockResponseBody: null,
  };
}

function normalizeRule(policyType, rule) {
  const isFrontDoor = policyType === 'frontdoor';
  return {
    name: String(rule?.name ?? ''),
    priority: Number.isInteger(rule?.priority) ? rule.priority : 1000,
    ruleType: String(rule?.ruleType ?? 'MatchRule'),
    action: String(rule?.action ?? 'Allow'),
    enabledState: String(rule?.enabledState ?? rule?.state ?? 'Enabled'),
    matchConditions: Array.isArray(rule?.matchConditions) ? rule.matchConditions : [],
    rateLimitDurationInMinutes: Number.isInteger(rule?.rateLimitDurationInMinutes) ? rule.rateLimitDurationInMinutes : 1,
    rateLimitThreshold: Number.isInteger(rule?.rateLimitThreshold) ? rule.rateLimitThreshold : 1,
    groupBy: isFrontDoor && Array.isArray(rule?.groupBy) ? rule.groupBy : [],
  };
}

function normalizePolicyRules(policyType, properties = {}) {
  const rawRules = policyType === 'frontdoor'
    ? properties.customRules?.rules
    : properties.customRules;
  if (!Array.isArray(rawRules)) return [];
  return rawRules
    .map(rule => normalizeRule(policyType, rule))
    .filter(rule => rule.name)
    .sort((a, b) => a.priority - b.priority);
}

function shouldEvaluateRule(rule) {
  return String(rule?.enabledState ?? 'Enabled') !== 'Disabled';
}

export class WafEvaluator {
  constructor() {
    this.policies = new Map();
    this.rateCounters = new Map();
  }

  registerPolicy({ policyId = null, policyName, policyType = 'application-gateway', properties }) {
    const normalizedPolicy = {
      policyId: policyId ?? null,
      policyName: String(policyName ?? ''),
      policyType,
      properties: properties ?? {},
      settings: normalizePolicySettings(policyType, properties ?? {}),
      rules: normalizePolicyRules(policyType, properties ?? {}),
    };
    const keys = new Set([
      policyKey(policyName),
      policyKey(policyId),
    ]);
    for (const key of keys) {
      if (key) this.policies.set(key, normalizedPolicy);
    }
  }

  unregisterPolicy(policyRef) {
    const key = policyKey(policyRef);
    if (!key) return;
    const existing = this.policies.get(key);
    if (!existing) return;
    for (const candidate of [existing.policyId, existing.policyName]) {
      const candidateKey = policyKey(candidate);
      if (candidateKey) this.policies.delete(candidateKey);
    }
    for (const counterKey of [...this.rateCounters.keys()]) {
      if (counterKey.startsWith(`${key}|`)) {
        this.rateCounters.delete(counterKey);
      }
    }
  }

  rateLimitExceeded({ policy, rule, request }) {
    const remoteAddr = firstForwardedAddress(request) || 'global';
    const key = `${policyKey(policy.policyId ?? policy.policyName)}|${rule.name}|${remoteAddr}`;
    const now = Date.now();
    const durationMs = Math.max(1, rule.rateLimitDurationInMinutes) * 60 * 1000;
    const threshold = Math.max(1, rule.rateLimitThreshold);
    const existing = this.rateCounters.get(key);
    if (!existing || existing.resetAt <= now) {
      this.rateCounters.set(key, { count: 1, resetAt: now + durationMs });
      return { exceeded: false, count: 1, threshold };
    }
    existing.count += 1;
    this.rateCounters.set(key, existing);
    return { exceeded: existing.count > threshold, count: existing.count, threshold };
  }

  evaluate({ policyRef = null, policyName = null, request }) {
    const policy = this.policies.get(policyKey(policyRef)) ?? this.policies.get(policyKey(policyName));
    if (!policy) {
      return {
        action: 'Allow',
        reason: 'PolicyNotFound',
        matchedRules: [],
        policyId: null,
        policyName: String(policyName ?? ''),
      };
    }

    if (policy.settings.state === 'Disabled') {
      return {
        action: 'Allow',
        reason: 'PolicyDisabled',
        matchedRules: [],
        policyId: policy.policyId,
        policyName: policy.policyName,
      };
    }

    const actionableRules = [];
    for (const rule of policy.rules) {
      if (!shouldEvaluateRule(rule)) continue;
      if (!rule.matchConditions.every(condition => conditionMatches(condition, request))) {
        continue;
      }
      if (rule.ruleType === 'RateLimitRule') {
        const rate = this.rateLimitExceeded({ policy, rule, request });
        if (!rate.exceeded) {
          continue;
        }
        actionableRules.push({
          name: rule.name,
          action: rule.action,
          priority: rule.priority,
          ruleType: rule.ruleType,
          count: rate.count,
          threshold: rate.threshold,
        });
        continue;
      }
      actionableRules.push({
        name: rule.name,
        action: rule.action,
        priority: rule.priority,
        ruleType: rule.ruleType,
      });
    }

    if (actionableRules.length === 0) {
      return {
        action: 'Allow',
        reason: 'NoRuleMatch',
        mode: policy.settings.mode,
        matchedRules: [],
        policyId: policy.policyId,
        policyName: policy.policyName,
      };
    }

    const selectedRule = actionableRules[0];
    if (policy.settings.mode !== 'Prevention' && selectedRule.action !== 'Allow') {
      return {
        action: 'Allow',
        reason: 'DetectionOnly',
        mode: policy.settings.mode,
        matchedRules: actionableRules,
        policyId: policy.policyId,
        policyName: policy.policyName,
      };
    }

    if (selectedRule.action === 'Allow' || selectedRule.action === 'Log' || selectedRule.action === 'AnomalyScoring') {
      return {
        action: 'Allow',
        reason: selectedRule.action === 'Allow' ? 'CustomRuleAllow' : 'CustomRuleLog',
        mode: policy.settings.mode,
        matchedRules: actionableRules,
        policyId: policy.policyId,
        policyName: policy.policyName,
      };
    }

    if (selectedRule.action === 'Redirect' && policy.settings.redirectUrl) {
      return {
        action: 'Redirect',
        reason: 'CustomRuleMatch',
        mode: policy.settings.mode,
        matchedRules: actionableRules,
        policyId: policy.policyId,
        policyName: policy.policyName,
        statusCode: 302,
        headers: { location: policy.settings.redirectUrl },
      };
    }

    const errorCode = selectedRule.action === 'CAPTCHA'
      ? 'WebApplicationFirewallCaptchaRequired'
      : selectedRule.action === 'JSChallenge'
        ? 'WebApplicationFirewallJavascriptChallenge'
        : 'WebApplicationFirewallRequestBlocked';

    return {
      action: selectedRule.action,
      reason: 'CustomRuleMatch',
      mode: policy.settings.mode,
      matchedRules: actionableRules,
      policyId: policy.policyId,
      policyName: policy.policyName,
      statusCode: policy.settings.customBlockResponseStatusCode ?? 403,
      responseBody: policy.settings.customBlockResponseBody ?? null,
      errorCode,
    };
  }
}

export function createWafEvaluator() {
  return new WafEvaluator();
}
