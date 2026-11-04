function poolKey(workspaceName, sqlPoolName) {
  return `${String(workspaceName).toLowerCase()}/${String(sqlPoolName).toLowerCase()}`;
}

function normalizeIdentifier(value) {
  return String(value ?? '').replace(/[\[\]]/g, '').toLowerCase();
}

function tableKey(name) {
  return String(name ?? '').split('.').map(normalizeIdentifier).join('.');
}

function error(status, code, message) {
  return { error: { status, code, message } };
}

function splitCsv(value) {
  const items = [];
  let current = '';
  let quote = null;
  let depth = 0;
  for (const char of String(value)) {
    if ((char === '\'' || char === '"') && quote === null) {
      quote = char;
      current += char;
      continue;
    }
    if (char === quote) {
      quote = null;
      current += char;
      continue;
    }
    if (char === '(' && quote === null) depth += 1;
    if (char === ')' && quote === null && depth > 0) depth -= 1;
    if (char === ',' && quote === null && depth === 0) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim() || value.endsWith(',')) items.push(current.trim());
  return items;
}

function parseLiteral(value) {
  const text = String(value ?? '').trim();
  if (/^null$/i.test(text)) return null;
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

export class SynapseSqlRunner {
  constructor() {
    this.pools = new Map();
  }

  registerPool({ workspaceName, sqlPoolName, status = 'Online' }) {
    const key = poolKey(workspaceName, sqlPoolName);
    if (!this.pools.has(key)) {
      this.pools.set(key, { workspaceName, sqlPoolName, status, tables: new Map() });
    } else {
      this.pools.get(key).status = status;
    }
  }

  unregisterPool({ workspaceName, sqlPoolName }) {
    this.pools.delete(poolKey(workspaceName, sqlPoolName));
  }

  setPoolStatus({ workspaceName, sqlPoolName, status }) {
    const pool = this.pools.get(poolKey(workspaceName, sqlPoolName));
    if (!pool) return error(404, 'SqlPoolNotFound', `Dedicated SQL pool '${workspaceName}/${sqlPoolName}' was not found.`);
    pool.status = status;
    return { status: 200, body: { workspaceName, sqlPoolName, status } };
  }

  execute({ workspaceName, sqlPoolName, sql }) {
    const pool = this.pools.get(poolKey(workspaceName, sqlPoolName));
    if (!pool) return error(404, 'SqlPoolNotFound', `Dedicated SQL pool '${workspaceName}/${sqlPoolName}' was not found.`);
    if (pool.status !== 'Online') {
      return error(409, 'SqlPoolUnavailable', `Dedicated SQL pool '${workspaceName}/${sqlPoolName}' is ${pool.status}.`);
    }
    const statement = String(sql ?? '').trim().replace(/;$/, '');
    if (!statement) return error(400, 'SqlParseError', 'SQL statement is required.');

    const create = statement.match(/^create\s+table\s+([a-zA-Z0-9_.\[\]]+)\s*\((.+)\)$/i);
    if (create) {
      const name = tableKey(create[1]);
      if (pool.tables.has(name)) return error(409, 'TableAlreadyExists', `Table '${create[1]}' already exists.`);
      const columns = splitCsv(create[2]).map(column => {
        const [columnName, ...typeParts] = column.split(/\s+/);
        return { name: normalizeIdentifier(columnName), type: typeParts.join(' ').toUpperCase() };
      });
      if (columns.length === 0 || columns.some(column => !column.name || !column.type)) {
        return error(400, 'SqlParseError', 'CREATE TABLE requires at least one typed column.');
      }
      pool.tables.set(name, { name: create[1], columns, rows: [] });
      return { status: 201, body: { tableName: create[1], columns } };
    }

    const insert = statement.match(/^insert\s+into\s+([a-zA-Z0-9_.\[\]]+)\s*\((.+)\)\s+values\s*\((.+)\)$/i);
    if (insert) {
      const table = pool.tables.get(tableKey(insert[1]));
      if (!table) return error(404, 'TableNotFound', `Table '${insert[1]}' was not found.`);
      const columns = splitCsv(insert[2]).map(normalizeIdentifier);
      const values = splitCsv(insert[3]).map(parseLiteral);
      if (columns.length !== values.length) {
        return error(400, 'SqlParseError', 'INSERT column count does not match value count.');
      }
      const knownColumns = new Set(table.columns.map(column => column.name));
      const unknownColumn = columns.find(column => !knownColumns.has(column));
      if (unknownColumn) return error(400, 'InvalidColumnName', `Invalid column name '${unknownColumn}'.`);
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      table.rows.push(row);
      return { status: 201, body: { rowsAffected: 1 } };
    }

    const count = statement.match(/^select\s+count\(\*\)(?:\s+as\s+([a-zA-Z0-9_\[\]]+))?\s+from\s+([a-zA-Z0-9_.\[\]]+)$/i);
    if (count) {
      const table = pool.tables.get(tableKey(count[2]));
      if (!table) return error(404, 'TableNotFound', `Table '${count[2]}' was not found.`);
      return { status: 200, body: { columns: [normalizeIdentifier(count[1] ?? 'count')], rows: [{ [normalizeIdentifier(count[1] ?? 'count')]: table.rows.length }] } };
    }

    const selectAll = statement.match(/^select\s+\*\s+from\s+([a-zA-Z0-9_.\[\]]+)(?:\s+order\s+by\s+([a-zA-Z0-9_\[\]]+))?$/i);
    if (selectAll) {
      const table = pool.tables.get(tableKey(selectAll[1]));
      if (!table) return error(404, 'TableNotFound', `Table '${selectAll[1]}' was not found.`);
      const orderBy = selectAll[2] ? normalizeIdentifier(selectAll[2]) : null;
      if (orderBy && !table.columns.some(column => column.name === orderBy)) {
        return error(400, 'InvalidColumnName', `Invalid column name '${orderBy}'.`);
      }
      const rows = [...table.rows].sort((left, right) => {
        if (!orderBy) return 0;
        return left[orderBy] > right[orderBy] ? 1 : left[orderBy] < right[orderBy] ? -1 : 0;
      });
      return { status: 200, body: { columns: table.columns.map(column => column.name), rows } };
    }

    return error(400, 'UnsupportedSqlStatement', 'This local Synapse SQL runner supports CREATE TABLE, INSERT, SELECT COUNT(*), and SELECT * only.');
  }
}

export function createSynapseSqlRunner() {
  return new SynapseSqlRunner();
}
