export class LoggingStore {
  constructor() {
    this.entries = [];
    this.metrics = new Map();
  }

  writeEntries({ entries = [], resource, labels = {} }) {
    const written = entries.map(entry => ({
      ...entry,
      resource: entry.resource ?? resource,
      labels: {
        ...labels,
        ...(entry.labels ?? {}),
      },
      timestamp: entry.timestamp ?? new Date().toISOString(),
      insertId: entry.insertId ?? `globalstack-${this.entries.length + 1}`,
    }));
    this.entries.push(...written);
    return written;
  }

  listEntries({ resourceNames = [], filter }) {
    return this.entries.filter(entry =>
      matchesResource(entry, resourceNames) && matchesFilter(entry, filter)
    );
  }

  createMetric({ projectId, metric }) {
    const key = metricName(projectId, metric.name);
    if (this.metrics.has(key)) return null;
    const stored = {
      ...metric,
      projectId,
      name: metric.name,
    };
    this.metrics.set(key, stored);
    return stored;
  }

  getMetric({ projectId, metricId }) {
    return this.metrics.get(metricName(projectId, metricId)) ?? null;
  }

  listMetrics(projectId) {
    return [...this.metrics.values()].filter(metric => metric.projectId === projectId);
  }

  deleteMetric({ projectId, metricId }) {
    return this.metrics.delete(metricName(projectId, metricId));
  }
}

export function metricName(projectId, metricId) {
  return `projects/${projectId}/metrics/${metricId}`;
}

function matchesResource(entry, resourceNames) {
  if (!resourceNames.length) return true;
  return resourceNames.some(resourceName => {
    const match = resourceName.match(/^projects\/([^/]+)$/);
    return match ? entry.logName?.startsWith(`projects/${match[1]}/`) : false;
  });
}

function matchesFilter(entry, filter) {
  if (!filter) return true;
  const logNameMatch = filter.match(/logName\s*=\s*"([^"]+)"/);
  if (logNameMatch && entry.logName !== logNameMatch[1]) return false;
  const severityMatch = filter.match(/severity\s*=\s*"([^"]+)"/);
  if (severityMatch && entry.severity !== severityMatch[1]) return false;
  return true;
}
