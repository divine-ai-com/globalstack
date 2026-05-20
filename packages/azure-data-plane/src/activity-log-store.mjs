import { randomUUID } from 'node:crypto';

function lower(value) {
  return String(value ?? '').toLowerCase();
}

export class ActivityLogStore {
  constructor() {
    this.records = [];
  }

  emit({
    resourceId,
    resourceGroup,
    operationName,
    status = 'Succeeded',
    category = 'Administrative',
    caller = 'globalstack-local-principal',
    correlationId = randomUUID(),
    eventTimestamp = new Date().toISOString(),
    properties = {},
  }) {
    const record = {
      id: randomUUID(),
      resourceId,
      resourceGroup,
      operationName,
      status,
      category,
      caller,
      correlationId,
      eventTimestamp,
      properties,
    };
    this.records.push(record);
    return record;
  }

  query({ resourceGroup, category, status, operationName, correlationId, since } = {}) {
    const sinceMs = since ? Date.parse(since) : null;
    return this.records.filter(record => {
      if (resourceGroup && lower(record.resourceGroup) !== lower(resourceGroup)) return false;
      if (category && record.category !== category) return false;
      if (status && record.status !== status) return false;
      if (operationName && record.operationName !== operationName) return false;
      if (correlationId && record.correlationId !== correlationId) return false;
      if (sinceMs && Date.parse(record.eventTimestamp) < sinceMs) return false;
      return true;
    });
  }
}

export function createActivityLogStore() {
  return new ActivityLogStore();
}
