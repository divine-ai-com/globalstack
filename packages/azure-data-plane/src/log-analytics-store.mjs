function workspaceKey(workspaceName) {
  return String(workspaceName ?? '').toLowerCase();
}

function error(status, code, message) {
  return { error: { status, code, message } };
}

function tableKey(tableName) {
  return String(tableName ?? '').trim();
}

function parseLiteral(value) {
  const text = String(value ?? '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

export class LogAnalyticsStore {
  constructor() {
    this.workspaces = new Map();
  }

  registerWorkspace({ workspaceName }) {
    const key = workspaceKey(workspaceName);
    if (!this.workspaces.has(key)) {
      this.workspaces.set(key, { workspaceName, tables: new Map() });
    }
  }

  unregisterWorkspace({ workspaceName }) {
    this.workspaces.delete(workspaceKey(workspaceName));
  }

  workspace(workspaceName) {
    return this.workspaces.get(workspaceKey(workspaceName));
  }

  ingest({ workspaceName, tableName, records }) {
    const workspace = this.workspace(workspaceName);
    if (!workspace) return error(404, 'WorkspaceNotFound', `Log Analytics workspace '${workspaceName}' was not found.`);
    const table = tableKey(tableName);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) {
      return error(400, 'InvalidTableName', 'Log Analytics table name must start with a letter and contain only letters, numbers, and underscores.');
    }
    if (!Array.isArray(records) || records.length === 0 || records.some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
      return error(400, 'InvalidLogRecords', 'Log ingestion requires a non-empty array of JSON object records.');
    }
    if (!workspace.tables.has(table)) workspace.tables.set(table, []);
    const now = new Date().toISOString();
    const normalized = records.map(record => ({ TimeGenerated: record.TimeGenerated ?? now, ...record }));
    workspace.tables.get(table).push(...normalized);
    return { status: 202, body: { accepted: normalized.length, tableName: table } };
  }

  query({ workspaceName, query }) {
    const workspace = this.workspace(workspaceName);
    if (!workspace) return error(404, 'WorkspaceNotFound', `Log Analytics workspace '${workspaceName}' was not found.`);
    const statement = String(query ?? '').trim();
    if (!statement) return error(400, 'InvalidQuery', 'KQL query text is required.');

    const [tableSegment, ...operators] = statement.split('|').map(part => part.trim()).filter(Boolean);
    const table = tableKey(tableSegment);
    if (!workspace.tables.has(table)) return error(404, 'TableNotFound', `Log Analytics table '${table}' was not found.`);

    let rows = [...workspace.tables.get(table)];
    for (const operator of operators) {
      const take = operator.match(/^take\s+(\d+)$/i);
      if (take) {
        rows = rows.slice(0, Number(take[1]));
        continue;
      }

      const where = operator.match(/^where\s+([A-Za-z_][A-Za-z0-9_]*)\s*==\s*(.+)$/i);
      if (where) {
        const [, column, rawValue] = where;
        const expected = parseLiteral(rawValue);
        rows = rows.filter(row => row[column] === expected);
        continue;
      }

      const count = operator.match(/^(summarize\s+count\(\)|count)$/i);
      if (count) {
        return { status: 200, body: { tables: [{ name: 'PrimaryResult', columns: [{ name: 'Count', type: 'long' }], rows: [[rows.length]] }] } };
      }

      return error(400, 'UnsupportedKqlOperator', `This local Log Analytics store does not support KQL operator '${operator}'.`);
    }

    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].map(name => ({ name, type: typeof rows.find(row => row[name] !== undefined)?.[name] === 'number' ? 'real' : 'string' }));
    return {
      status: 200,
      body: {
        tables: [{
          name: 'PrimaryResult',
          columns,
          rows: rows.map(row => columns.map(column => row[column.name] ?? null)),
        }],
      },
    };
  }
}

export function createLogAnalyticsStore() {
  return new LogAnalyticsStore();
}
