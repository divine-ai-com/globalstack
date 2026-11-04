import { createHash } from 'node:crypto';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';

function parseEndpoint(value, fallback) {
  const target = value ?? fallback;
  if (!target) return null;
  const url = new URL(target);
  return {
    protocol: url.protocol,
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'mysql:' ? 3306 : 5432)),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, '') || ''),
  };
}

function sanitizedSegment(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20) || 'db';
}

function normalizeServerAlias(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.postgres\.database\.azure\.com$/i, '')
    .replace(/\.mysql\.database\.azure\.com$/i, '');
}

export function physicalDatabaseName(engine, serverName, databaseName) {
  const digest = createHash('sha256')
    .update(`${engine}:${serverName}:${databaseName}`)
    .digest('hex')
    .slice(0, 12);
  const prefix = engine === 'postgres' ? 'pg' : 'my';
  return `${prefix}_${sanitizedSegment(serverName)}_${sanitizedSegment(databaseName)}_${digest}`.slice(0, 63);
}

function pgConnectConfig(endpoint, database) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.user,
    password: endpoint.password,
    database,
    ssl: false,
  };
}

function mysqlConnectConfig(endpoint, database) {
  return {
    host: endpoint.host,
    port: endpoint.port,
    user: endpoint.user,
    password: endpoint.password,
    database,
    ssl: false,
    multipleStatements: true,
  };
}

function postgresVersionParts(raw) {
  const text = String(raw ?? '');
  const brand = text.split(' on ')[0] ?? text;
  const version = brand.match(/PostgreSQL\s+([0-9.]+)/i)?.[1] ?? brand;
  return { brandVersion: brand, version };
}

function mysqlVersionParts(raw) {
  const text = String(raw ?? '');
  const version = text.match(/^([0-9.]+)/)?.[1] ?? text;
  return { brandVersion: text, version };
}

function quotePostgresIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function quoteMysqlIdentifier(name) {
  return `\`${String(name).replaceAll('`', '``')}\``;
}

function normalizeSelectedDatabases(input) {
  const selected = input?.selectedDatabases;
  if (Array.isArray(selected) && selected.length) return selected;
  return [input?.databaseName].filter(Boolean).map(name => ({ name, targetDatabaseName: name }));
}

function selectedTableMap(selection, discoveredTables) {
  const selectedTables = Array.isArray(selection.selectedTables)
    ? new Set(selection.selectedTables.map(item => String(item?.name ?? item)).filter(Boolean))
    : null;
  const tableMap = selection.tableMap && typeof selection.tableMap === 'object' && !Array.isArray(selection.tableMap)
    ? selection.tableMap
    : {};
  return discoveredTables
    .filter(table => !selectedTables || selectedTables.has(table.tableName))
    .map(table => ({
      ...table,
      targetTableName: String(tableMap[table.tableName] ?? table.tableName),
    }));
}

async function withPgClient(endpoint, database, fn) {
  const client = new PgClient(pgConnectConfig(endpoint, database));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function withMysqlConnection(endpoint, database, fn) {
  const connection = await mysql.createConnection(mysqlConnectConfig(endpoint, database));
  try {
    return await fn(connection);
  } finally {
    await connection.end().catch(() => {});
  }
}

function serverAliases(serverName, fqdn) {
  const aliases = new Set();
  if (serverName) aliases.add(normalizeServerAlias(serverName));
  if (fqdn) aliases.add(normalizeServerAlias(fqdn));
  return [...aliases].filter(Boolean);
}

function redactedConnectionInfo(info) {
  if (!info || typeof info !== 'object') return info;
  const clone = structuredClone(info);
  for (const key of Object.keys(clone)) {
    if (String(key).toLowerCase().includes('password')) delete clone[key];
  }
  return clone;
}

export class RelationalBackendManager {
  constructor({
    postgresEndpoint = process.env.GLOBALSTACK_POSTGRES_ENDPOINT ?? 'postgres://globalstack:globalstack@127.0.0.1:5432/postgres',
    mysqlEndpoint = process.env.GLOBALSTACK_MYSQL_ENDPOINT ?? 'mysql://globalstack:globalstack@127.0.0.1:3306/globalstack',
  } = {}) {
    this.postgresEndpoint = parseEndpoint(postgresEndpoint, 'postgres://globalstack:globalstack@127.0.0.1:5432/postgres');
    this.mysqlEndpoint = parseEndpoint(mysqlEndpoint, 'mysql://globalstack:globalstack@127.0.0.1:3306/globalstack');
    this.mysqlAdminEndpoint = {
      ...this.mysqlEndpoint,
      user: process.env.GLOBALSTACK_MYSQL_ADMIN_USER ?? 'root',
      password: process.env.GLOBALSTACK_MYSQL_ROOT_PASSWORD ?? 'globalstack-root',
    };
    this.servers = {
      postgres: new Map(),
      mysql: new Map(),
    };
    this.aliases = {
      postgres: new Map(),
      mysql: new Map(),
    };
  }

  registerServer({ engine, serverName, fqdn = null, administratorLogin = null, administratorLoginPassword = null }) {
    const normalized = normalizeServerAlias(serverName);
    if (!normalized) return;
    this.servers[engine].set(normalized, {
      name: normalized,
      fqdn,
      administratorLogin,
      administratorLoginPassword,
    });
    for (const alias of serverAliases(serverName, fqdn)) this.aliases[engine].set(alias, normalized);
  }

  unregisterServer({ engine, serverName, fqdn = null }) {
    const normalized = normalizeServerAlias(serverName);
    if (!normalized) return;
    this.servers[engine].delete(normalized);
    for (const alias of serverAliases(serverName, fqdn)) this.aliases[engine].delete(alias);
  }

  resolveServer(engine, connectionInfo = {}) {
    const alias = normalizeServerAlias(connectionInfo.dataSource ?? connectionInfo.serverName ?? '');
    const normalized = this.aliases[engine].get(alias) ?? alias;
    return this.servers[engine].get(normalized) ?? null;
  }

  verifyConnectionCredentials(engine, server, connectionInfo = {}) {
    if (!server) return;
    const expectedUser = String(server.administratorLogin ?? '').trim();
    const actualUser = String(connectionInfo.userName ?? '').trim();
    const expectedPassword = String(server.administratorLoginPassword ?? '');
    const actualPassword = String(connectionInfo.password ?? '');
    if (expectedUser && actualUser && actualUser !== expectedUser && actualUser !== `${expectedUser}@${server.name}`) {
      throw Object.assign(new Error(`Authentication failed for ${engine} server '${server.name}'.`), {
        status: 400,
        code: 'InvalidConnectionInfo',
      });
    }
    if (expectedPassword && actualPassword && actualPassword !== expectedPassword) {
      throw Object.assign(new Error(`Authentication failed for ${engine} server '${server.name}'.`), {
        status: 400,
        code: 'InvalidConnectionInfo',
      });
    }
  }

  databaseNameFor(engine, { serverName, databaseName }) {
    return physicalDatabaseName(engine, normalizeServerAlias(serverName), databaseName);
  }

  async ensureDatabase({ engine, serverName, databaseName }) {
    const physical = this.databaseNameFor(engine, { serverName, databaseName });
    if (engine === 'postgres') {
      await withPgClient(this.postgresEndpoint, this.postgresEndpoint.database || 'postgres', async (client) => {
        const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [physical]);
        if (existing.rowCount === 0) {
          await client.query(`CREATE DATABASE ${quotePostgresIdentifier(physical)}`);
        }
      });
      return { physicalDatabaseName: physical };
    }
    await withMysqlConnection(this.mysqlAdminEndpoint, this.mysqlAdminEndpoint.database || undefined, async (connection) => {
      await connection.query(`CREATE DATABASE IF NOT EXISTS ${quoteMysqlIdentifier(physical)}`);
      await connection.query(`GRANT ALL PRIVILEGES ON ${quoteMysqlIdentifier(physical)}.* TO 'globalstack'@'%'`);
      await connection.query('FLUSH PRIVILEGES');
    });
    return { physicalDatabaseName: physical };
  }

  async dropDatabase({ engine, serverName, databaseName }) {
    const physical = this.databaseNameFor(engine, { serverName, databaseName });
    if (engine === 'postgres') {
      await withPgClient(this.postgresEndpoint, this.postgresEndpoint.database || 'postgres', async (client) => {
        await client.query(
          `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
            WHERE datname = $1
              AND pid <> pg_backend_pid()`,
          [physical],
        );
        await client.query(`DROP DATABASE IF EXISTS ${quotePostgresIdentifier(physical)}`);
      });
      return;
    }
    await withMysqlConnection(this.mysqlAdminEndpoint, this.mysqlAdminEndpoint.database || undefined, async (connection) => {
      await connection.query(`DROP DATABASE IF EXISTS ${quoteMysqlIdentifier(physical)}`);
    });
  }

  async describeConnection({ engine, connectionInfo, role }) {
    const server = this.resolveServer(engine, connectionInfo);
    if (server) this.verifyConnectionCredentials(engine, server, connectionInfo);
    const endpoint = engine === 'postgres' ? this.postgresEndpoint : this.mysqlEndpoint;
    const logicalServerName = server?.name ?? normalizeServerAlias(connectionInfo.dataSource ?? connectionInfo.serverName ?? endpoint.host);
    const infoDatabase = connectionInfo.databaseName ?? endpoint.database ?? (engine === 'postgres' ? 'postgres' : undefined);
    const rolePrefix = role === 'source' ? 'source' : 'target';
    if (engine === 'postgres') {
      return withPgClient(endpoint, endpoint.database || 'postgres', async (client) => {
        const versionRaw = (await client.query('SELECT version() AS version')).rows[0]?.version ?? '';
        const databases = (await client.query(
          `SELECT datname
             FROM pg_database
            WHERE datistemplate = false
              AND datallowconn = true
              AND datname NOT IN ('postgres')
            ORDER BY datname`,
        )).rows.map(row => row.datname);
        const { brandVersion, version } = postgresVersionParts(versionRaw);
        return {
          [`${rolePrefix}ServerVersion`]: version,
          [`${rolePrefix}ServerBrandVersion`]: brandVersion,
          databases,
          databaseSchemaMap: [],
          databaseName: infoDatabase,
          connectionInfo: redactedConnectionInfo(connectionInfo),
          logicalServerName,
        };
      });
    }
    return withMysqlConnection(this.mysqlAdminEndpoint, this.mysqlAdminEndpoint.database || undefined, async (connection) => {
      const [versionRows] = await connection.query('SELECT VERSION() AS version');
      const [databaseRows] = await connection.query(
        `SELECT schema_name AS name
           FROM information_schema.schemata
          WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
          ORDER BY schema_name`,
      );
      const { brandVersion, version } = mysqlVersionParts(versionRows[0]?.version ?? '');
      return {
        [`${rolePrefix}ServerVersion`]: version,
        [`${rolePrefix}ServerBrandVersion`]: brandVersion,
        databases: databaseRows.map(row => row.name),
        databaseName: infoDatabase,
        connectionInfo: redactedConnectionInfo(connectionInfo),
        logicalServerName,
      };
    });
  }

  async listUserTables({ engine, connectionInfo, databaseNames = [] }) {
    const server = this.resolveServer(engine, connectionInfo);
    if (server) this.verifyConnectionCredentials(engine, server, connectionInfo);
    const requested = databaseNames.length
      ? databaseNames
      : [connectionInfo.databaseName].filter(Boolean);
    const endpoint = engine === 'postgres' ? this.postgresEndpoint : this.mysqlEndpoint;
    const results = [];
    for (const databaseName of requested) {
      const physical = server
        ? this.databaseNameFor(engine, { serverName: server.name, databaseName })
        : databaseName;
      if (engine === 'postgres') {
        const output = await withPgClient(endpoint, physical, async (client) => {
          const { rows } = await client.query(
            `SELECT table_schema, table_name
               FROM information_schema.tables
              WHERE table_type = 'BASE TABLE'
                AND table_schema NOT IN ('pg_catalog', 'information_schema')
              ORDER BY table_schema, table_name`,
          );
          return rows.map(row => ({
            schemaName: row.table_schema,
            tableName: row.table_name,
          }));
        });
        results.push({
          name: databaseName,
          databaseName,
          tables: output,
        });
        continue;
      }
      const output = await withMysqlConnection(this.mysqlAdminEndpoint, physical, async (connection) => {
        const [rows] = await connection.query(`SHOW FULL TABLES FROM ${quoteMysqlIdentifier(physical)} WHERE Table_type = 'BASE TABLE'`);
        return rows.map(row => {
          const [tableName] = Object.entries(row).find(([key]) => key !== 'Table_type') ?? [];
          return {
            schemaName: physical,
            tableName: row[tableName],
          };
        });
      });
      results.push({
        name: databaseName,
        databaseName,
        tables: output,
      });
    }
    return results;
  }

  async migrateSelectedDatabases({ engine, sourceConnectionInfo, targetConnectionInfo, selectedDatabases = [] }) {
    const sourceServer = this.resolveServer(engine, sourceConnectionInfo);
    const targetServer = this.resolveServer(engine, targetConnectionInfo);
    if (sourceServer) this.verifyConnectionCredentials(engine, sourceServer, sourceConnectionInfo);
    if (targetServer) this.verifyConnectionCredentials(engine, targetServer, targetConnectionInfo);
    const sourceEndpoint = engine === 'postgres' ? this.postgresEndpoint : this.mysqlEndpoint;
    const targetEndpoint = engine === 'postgres' ? this.postgresEndpoint : this.mysqlAdminEndpoint;
    const selections = normalizeSelectedDatabases({ selectedDatabases, databaseName: sourceConnectionInfo?.databaseName });
    if (!selections.length) {
      throw Object.assign(new Error('Migration task input.selectedDatabases must include at least one database.'), {
        status: 400,
        code: 'InvalidMigrationInput',
      });
    }

    const migratedDatabases = [];
    for (const selection of selections) {
      const sourceDatabaseName = selection.name ?? selection.databaseName;
      const targetDatabaseName = selection.targetDatabaseName ?? sourceDatabaseName;
      if (!sourceDatabaseName || !targetDatabaseName) {
        throw Object.assign(new Error('Each selected database requires name and targetDatabaseName.'), {
          status: 400,
          code: 'InvalidMigrationInput',
        });
      }
      const sourcePhysical = sourceServer
        ? this.databaseNameFor(engine, { serverName: sourceServer.name, databaseName: sourceDatabaseName })
        : sourceDatabaseName;
      const targetPhysical = targetServer
        ? this.databaseNameFor(engine, { serverName: targetServer.name, databaseName: targetDatabaseName })
        : targetDatabaseName;
      if (targetServer) {
        await this.ensureDatabase({ engine, serverName: targetServer.name, databaseName: targetDatabaseName });
      }
      const discovered = await this.listUserTables({
        engine,
        connectionInfo: sourceConnectionInfo,
        databaseNames: [sourceDatabaseName],
      });
      const tables = selectedTableMap(selection, discovered[0]?.tables ?? []);
      const migratedTables = [];
      if (engine === 'mysql') {
        await withMysqlConnection(this.mysqlAdminEndpoint, undefined, async (connection) => {
          for (const table of tables) {
            const sourceTable = quoteMysqlIdentifier(table.tableName);
            const targetTable = quoteMysqlIdentifier(table.targetTableName);
            await connection.query(`DROP TABLE IF EXISTS ${quoteMysqlIdentifier(targetPhysical)}.${targetTable}`);
            await connection.query(`CREATE TABLE ${quoteMysqlIdentifier(targetPhysical)}.${targetTable} LIKE ${quoteMysqlIdentifier(sourcePhysical)}.${sourceTable}`);
            const [result] = await connection.query(
              `INSERT INTO ${quoteMysqlIdentifier(targetPhysical)}.${targetTable} SELECT * FROM ${quoteMysqlIdentifier(sourcePhysical)}.${sourceTable}`,
            );
            migratedTables.push({
              sourceTableName: table.tableName,
              targetTableName: table.targetTableName,
              rowsCopied: Number(result?.affectedRows ?? 0),
            });
          }
        });
      } else {
        await withPgClient(sourceEndpoint, sourcePhysical, async (sourceClient) => {
          await withPgClient(targetEndpoint, targetPhysical, async (targetClient) => {
            for (const table of tables) {
              const columns = (await sourceClient.query(
                `SELECT a.attname AS column_name,
                        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                        a.attnotnull AS not_null
                   FROM pg_catalog.pg_attribute a
                   JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
                   JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = $1
                    AND c.relname = $2
                    AND a.attnum > 0
                    AND NOT a.attisdropped
                  ORDER BY a.attnum`,
                [table.schemaName ?? 'public', table.tableName],
              )).rows;
              const columnSql = columns
                .map(column => `${quotePostgresIdentifier(column.column_name)} ${column.data_type}${column.not_null ? ' NOT NULL' : ''}`)
                .join(', ');
              await targetClient.query(`DROP TABLE IF EXISTS ${quotePostgresIdentifier(table.targetTableName)}`);
              await targetClient.query(`CREATE TABLE ${quotePostgresIdentifier(table.targetTableName)} (${columnSql || 'id text'})`);
              const rows = (await sourceClient.query(`SELECT * FROM ${quotePostgresIdentifier(table.schemaName ?? 'public')}.${quotePostgresIdentifier(table.tableName)}`)).rows;
              for (const row of rows) {
                const names = Object.keys(row);
                const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
                await targetClient.query(
                  `INSERT INTO ${quotePostgresIdentifier(table.targetTableName)} (${names.map(quotePostgresIdentifier).join(', ')}) VALUES (${placeholders})`,
                  names.map(name => row[name]),
                );
              }
              migratedTables.push({
                sourceTableName: table.tableName,
                targetTableName: table.targetTableName,
                rowsCopied: rows.length,
              });
            }
          });
        });
      }
      migratedDatabases.push({
        name: sourceDatabaseName,
        targetDatabaseName,
        sourcePhysicalDatabaseName: sourcePhysical,
        targetPhysicalDatabaseName: targetPhysical,
        tables: migratedTables,
      });
    }
    return {
      migrationState: 'Completed',
      migratedDatabases,
      sourceConnectionInfo: redactedConnectionInfo(sourceConnectionInfo),
      targetConnectionInfo: redactedConnectionInfo(targetConnectionInfo),
    };
  }
}

export function createRelationalBackendManager(options = {}) {
  return new RelationalBackendManager(options);
}
