import assert from 'node:assert/strict';
import { AccessError, uuid } from './auth.mjs';
import { documentIdentity } from './repository.mjs';

export function validatePrincipal(principal) {
  assert.match(principal.tenant, /^[a-zA-Z0-9_-]{1,80}$/);
  assert.match(principal.subject, uuid);
  assert.ok(Array.isArray(principal.groups) && principal.groups.length <= 200 && principal.groups.every(value => uuid.test(value)));
}

export async function registerDocumentAccess(pool, principal, { blobUrl, fileName, uploadKey, readGroups = [] }) {
  validatePrincipal(principal); assert.match(uploadKey, uuid);
  assert.ok(Array.isArray(readGroups) && readGroups.length <= 50);
  if (!readGroups.every(value => uuid.test(value) && principal.groups.includes(value.toLowerCase()))) throw new AccessError(403, 'share_group_denied');
  const documentId = documentIdentity(principal.tenant, blobUrl);
  await pool.query(`INSERT INTO document_access(document_id,tenant_id,owner_id,upload_key,blob_url,file_name,read_groups)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [documentId, principal.tenant, principal.subject, uploadKey, blobUrl, fileName, [...new Set(readGroups.map(value => value.toLowerCase()))]]);
  const access = (await pool.query('SELECT * FROM document_access WHERE tenant_id=$1 AND owner_id=$2 AND upload_key=$3',
    [principal.tenant, principal.subject, uploadKey])).rows[0];
  if (!access || access.document_id !== documentId || access.file_name !== fileName) throw new AccessError(409, 'upload_key_conflict');
  return access;
}

export async function documentAccess(pool, principal, documentId, { write = false } = {}) {
  validatePrincipal(principal);
  if (!uuid.test(documentId)) throw new AccessError(404, 'document_not_found');
  const access = (await pool.query(`SELECT * FROM document_access WHERE tenant_id=$1 AND document_id=$2
    AND (owner_id=$3 OR ($5=false AND read_groups && $4::uuid[]))`,
  [principal.tenant, documentId, principal.subject, principal.groups, write])).rows[0];
  if (!access) throw new AccessError(404, 'document_not_found');
  return access;
}

export function searchAccessFilter(principal) {
  validatePrincipal(principal);
  const groups = principal.groups.length ? ` or read_groups/any(g:search.in(g,'${principal.groups.join(',')}',','))` : '';
  return `tenant_id eq '${principal.tenant}' and scan_status eq 'CLEAN' and (owner_id eq '${principal.subject}'${groups})`;
}
