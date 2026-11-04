function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeMetricNamespace(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeMetricName(value) {
  return String(value ?? '').trim().toLowerCase();
}

function durationMs(value) {
  const match = String(value ?? '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  return ((Number(hours) * 60 * 60) + (Number(minutes) * 60) + Number(seconds)) * 1000;
}

function aggregateSamples(samples, timeAggregation) {
  if (!samples.length) return null;
  const values = samples.map(sample => Number(sample.value)).filter(Number.isFinite);
  if (!values.length) return null;
  switch (String(timeAggregation ?? '').toLowerCase()) {
    case 'average':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case 'total':
      return values.reduce((sum, value) => sum + value, 0);
    case 'maximum':
      return Math.max(...values);
    case 'minimum':
      return Math.min(...values);
    case 'count':
      return values.length;
    default:
      return values.at(-1);
  }
}

function compare(operator, actual, threshold) {
  switch (String(operator ?? '')) {
    case 'GreaterThan':
      return actual > threshold;
    case 'GreaterThanOrEqual':
      return actual >= threshold;
    case 'LessThan':
      return actual < threshold;
    case 'LessThanOrEqual':
      return actual <= threshold;
    case 'Equals':
      return actual === threshold;
    case 'NotEquals':
      return actual !== threshold;
    default:
      return false;
  }
}

function criteriaItems(alertResource) {
  return alertResource?.properties?.criteria?.allOf ?? [];
}

export class MetricStore {
  constructor() {
    this.actionGroups = new Map();
    this.metricAlerts = new Map();
    this.metricSamples = new Map();
    this.alertStates = new Map();
    this.actionInvocations = [];
  }

  registerActionGroup(resource) {
    if (!resource?.id) return;
    this.actionGroups.set(normalizeId(resource.id), deepClone(resource));
  }

  unregisterActionGroup(resource) {
    const id = normalizeId(resource?.id ?? resource);
    if (!id) return;
    this.actionGroups.delete(id);
  }

  registerMetricAlert(resource) {
    if (!resource?.id) return;
    const id = normalizeId(resource.id);
    this.metricAlerts.set(id, deepClone(resource));
    if (!this.alertStates.has(id)) {
      this.alertStates.set(id, {
        alertId: id,
        alertName: resource.name,
        status: 'Resolved',
        fired: false,
        lastEvaluatedAt: null,
        lastMetricValue: null,
        actionGroupIds: (resource.properties?.actions ?? [])
          .map(action => normalizeId(action.actionGroupId))
          .filter(Boolean),
      });
    }
  }

  unregisterMetricAlert(resource) {
    const id = normalizeId(resource?.id ?? resource);
    if (!id) return;
    this.metricAlerts.delete(id);
    this.alertStates.delete(id);
    this.actionInvocations = this.actionInvocations.filter(item => item.alertId !== id);
  }

  ingestMetric({ scope, metricNamespace, metricName, value, timestamp = new Date().toISOString(), dimensions = {} }) {
    const sample = {
      scope: normalizeId(scope),
      metricNamespace: normalizeMetricNamespace(metricNamespace),
      metricName: normalizeMetricName(metricName),
      value: Number(value),
      timestamp: new Date(timestamp).toISOString(),
      dimensions: deepClone(dimensions),
    };
    const key = [sample.scope, sample.metricNamespace, sample.metricName].join('|');
    const samples = this.metricSamples.get(key) ?? [];
    samples.push(sample);
    this.metricSamples.set(key, samples);
    return deepClone(sample);
  }

  listSamples({ scope, metricNamespace, metricName, start = null, end = null }) {
    const key = [
      normalizeId(scope),
      normalizeMetricNamespace(metricNamespace),
      normalizeMetricName(metricName),
    ].join('|');
    const startMs = start ? new Date(start).getTime() : Number.NEGATIVE_INFINITY;
    const endMs = end ? new Date(end).getTime() : Number.POSITIVE_INFINITY;
    return deepClone(
      (this.metricSamples.get(key) ?? []).filter(sample => {
        const timestampMs = new Date(sample.timestamp).getTime();
        return timestampMs >= startMs && timestampMs <= endMs;
      }),
    );
  }

  evaluateAlert(alertResourceOrId, { now = new Date().toISOString() } = {}) {
    const alertId = normalizeId(alertResourceOrId?.id ?? alertResourceOrId);
    const alert = this.metricAlerts.get(alertId);
    if (!alert) return null;
    const nowMs = new Date(now).getTime();
    const scopes = alert.properties?.scopes ?? [];
    const criteria = criteriaItems(alert);
    let fired = criteria.length > 0;
    let lastMetricValue = null;

    for (const criterion of criteria) {
      const sampleGroups = scopes.map(scope => {
        const key = [
          normalizeId(scope),
          normalizeMetricNamespace(criterion.metricNamespace),
          normalizeMetricName(criterion.metricName),
        ].join('|');
        const windowStart = nowMs - durationMs(alert.properties?.windowSize ?? 'PT5M');
        return (this.metricSamples.get(key) ?? []).filter(sample => new Date(sample.timestamp).getTime() >= windowStart);
      });
      const samples = sampleGroups.flat();
      const aggregatedValue = aggregateSamples(samples, criterion.timeAggregation);
      lastMetricValue = aggregatedValue;
      if (aggregatedValue === null || !compare(criterion.operator, aggregatedValue, Number(criterion.threshold))) {
        fired = false;
        break;
      }
    }

    const previous = this.alertStates.get(alertId) ?? {
      alertId,
      alertName: alert.name,
      status: 'Resolved',
      fired: false,
      lastEvaluatedAt: null,
      lastMetricValue: null,
      actionGroupIds: [],
    };

    const next = {
      alertId,
      alertName: alert.name,
      status: fired ? 'Fired' : 'Resolved',
      fired,
      lastEvaluatedAt: new Date(nowMs).toISOString(),
      lastMetricValue,
      actionGroupIds: (alert.properties?.actions ?? [])
        .map(action => normalizeId(action.actionGroupId))
        .filter(Boolean),
    };
    this.alertStates.set(alertId, next);

    if (fired && !previous.fired) {
      for (const actionGroupId of next.actionGroupIds) {
        const actionGroup = this.actionGroups.get(actionGroupId);
        this.actionInvocations.push({
          alertId,
          alertName: alert.name,
          actionGroupId,
          actionGroupName: actionGroup?.name ?? actionGroupId.split('/').at(-1) ?? '',
          firedAt: next.lastEvaluatedAt,
        });
      }
    }

    return deepClone(next);
  }

  getAlertState(alertResourceOrId) {
    const alertId = normalizeId(alertResourceOrId?.id ?? alertResourceOrId);
    const state = this.alertStates.get(alertId);
    return state ? deepClone(state) : null;
  }

  listActionInvocations(alertResourceOrId = null) {
    if (!alertResourceOrId) return deepClone(this.actionInvocations);
    const alertId = normalizeId(alertResourceOrId?.id ?? alertResourceOrId);
    return deepClone(this.actionInvocations.filter(item => item.alertId === alertId));
  }
}

export function createMetricStore() {
  return new MetricStore();
}
