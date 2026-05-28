import { randomUUID } from 'node:crypto';

function lower(value) {
  return String(value ?? '').toLowerCase();
}

export class ActivityLogStore {
  constructor({ onDiagnosticRecord = null } = {}) {
    this.records = [];
    this.diagnosticSettings = new Map();
    this.onDiagnosticRecord = onDiagnosticRecord;
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
    this.deliverDiagnostics(record);
    return record;
  }

  registerDiagnosticSetting({ settingId, scope, workspaceId, logs = [] }) {
    if (!settingId || !scope || !workspaceId) return;
    this.diagnosticSettings.set(lower(settingId), {
      settingId,
      scope,
      workspaceId,
      categories: new Set(
        logs
          .filter(log => log?.enabled !== false)
          .map(log => log.category)
          .filter(Boolean),
      ),
    });
  }

  unregisterDiagnosticSetting(settingId) {
    this.diagnosticSettings.delete(lower(settingId));
  }

  deliverDiagnostics(record) {
    if (typeof this.onDiagnosticRecord !== 'function') return;
    for (const setting of this.diagnosticSettings.values()) {
      const scope = lower(setting.scope);
      const resourceId = lower(record.resourceId);
      const scopeMatches = resourceId === scope || resourceId.startsWith(`${scope}/`);
      if (!scopeMatches) continue;
      if (setting.categories.size > 0 && !setting.categories.has(record.category)) continue;
      this.onDiagnosticRecord({
        workspaceId: setting.workspaceId,
        tableName: 'AzureActivity',
        record: {
          TimeGenerated: record.eventTimestamp,
          ResourceId: record.resourceId,
          ResourceGroup: record.resourceGroup,
          OperationName: record.operationName,
          ActivityStatus: record.status,
          Category: record.category,
          Caller: record.caller,
          CorrelationId: record.correlationId,
          Properties: JSON.stringify(record.properties ?? {}),
        },
      });
    }
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

export function createActivityLogStore(options = {}) {
  return new ActivityLogStore(options);
}
