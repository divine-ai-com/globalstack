import { createDatabasePool } from './adapters.mjs';

// Opt-in deployment check for the worker's actual identity and SQL path.
export function createDatabaseDiagnostic({ openPool = createDatabasePool } = {}) {
  return async () => {
    let pool;
    try {
      pool = await openPool();
      const result = await pool.query('SELECT current_user AS role, count(*)::integer AS documents FROM document_access');
      return { status: 200, jsonBody: { database: 'ready', role: result.rows[0].role,
        documents: result.rows[0].documents } };
    } catch (error) {
      return { status: 502, jsonBody: { database: 'unavailable' } };
    } finally { await pool?.end(); }
  };
}
