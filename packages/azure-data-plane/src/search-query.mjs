// This evaluator covers a bounded local query surface. Unsupported syntax must
// fail explicitly rather than return an unrelated set of documents as success.
function invalid(message, code = 'InvalidRequestParameter', detailCode) {
  return { error: { status: 400, code, message, ...(detailCode ? { details: [{ code: detailCode, message }] } : {}) } };
}

function unsupported(message) {
  return { error: { status: 501, code: 'GlobalStackQueryNotImplemented', message } };
}

function terms(value) {
  return String(value ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Adjacent transpositions count as one edit. Fuzzy queries do not stem input.
export function fuzzyDistance(left, right) {
  const a = [...left], b = [...right];
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }
    }
  }
  return matrix[a.length][b.length];
}

function textCandidates(index, documents, request) {
  const text = request.search ?? '*';
  if (typeof text !== 'string') return invalid('The search parameter must be a string.');
  if (!text || text === '*') return { documents };
  const queryType = request.queryType ?? 'simple';
  if (!['simple', 'full'].includes(queryType)) return unsupported('Semantic query execution is not implemented by the local evaluator.');
  const searchMode = request.searchMode ?? 'any';
  if (!['any', 'all'].includes(searchMode)) return invalid('The searchMode must be any or all.');
  let fields = index.fields.filter(field => ['Edm.String', 'Collection(Edm.String)'].includes(field.type) && field.searchable !== false);
  if (request.searchFields !== undefined) {
    if (typeof request.searchFields !== 'string') return invalid('The searchFields parameter must be a comma-separated string.');
    const names = request.searchFields.split(',').map(name => name.trim());
    if (names.some(name => !fields.some(field => field.name === name))) return invalid('A requested search field is missing or is not searchable.');
    fields = fields.filter(field => names.includes(field.name));
  }
  // Limit this first implementation to terms and fuzzy terms. Fielded, phrase,
  // wildcard and Boolean expressions need their own parser and Azure captures.
  const parts = text.trim().split(/\s+/u);
  if (parts.length > 32 || parts.some(part => [...part].length > 258)) return unsupported('The local query limit is 32 terms of at most 255 characters each.');
  if (parts.some(part => !/^[\p{L}\p{N}]+(?:~[012]?)?$/u.test(part) || ['AND', 'OR', 'NOT'].includes(part))) {
    return unsupported('This local evaluator supports plain terms and full-query fuzzy terms only.');
  }
  if (queryType !== 'full' && parts.some(part => part.includes('~'))) return unsupported('Fuzzy syntax requires the full query parser.');
  const tokenized = documents.map(document => ({ document, words: new Set(fields.flatMap(field => {
    const value = document[field.name];
    return (Array.isArray(value) ? value : [value]).flatMap(terms);
  })) }));
  const dictionary = [...new Set(tokenized.flatMap(item => [...item.words]))];
  const expansions = parts.map(part => {
    const [term, edits] = part.toLowerCase().split('~');
    if (edits === undefined) return new Set([term]);
    const distance = edits === '' ? 2 : Number(edits);
    return new Set(dictionary.filter(word => [...word].length <= 255 && Math.abs([...word].length - [...term].length) <= distance)
      .map(word => ({ word, distance: fuzzyDistance(term, word) }))
      .filter(item => item.distance <= distance && (item.distance === 0 || item.distance < Math.min([...term].length, [...item.word].length)))
      .sort((a, b) => a.distance - b.distance || a.word.localeCompare(b.word))
      .slice(0, 50).map(item => item.word));
  });
  return { documents: tokenized.filter(item => {
    const matched = expansions.map(set => [...set].some(word => item.words.has(word)));
    return searchMode === 'all' ? matched.every(Boolean) : matched.some(Boolean);
  }).map(item => item.document) };
}

function vectorCandidates(index, documents, request) {
  if (!Array.isArray(request.vectorQueries) || request.vectorQueries.length !== 1) return unsupported('The local vector evaluator currently requires exactly one vector query.');
  if (request.search && request.search !== '*') return unsupported('Hybrid text and vector ranking is not implemented by the local evaluator.');
  const query = request.vectorQueries[0];
  if (!query || query.kind !== 'vector') return unsupported('Integrated vectorization is not implemented by the local evaluator.');
  const supported = new Set(['kind', 'fields', 'vector', 'k', 'exhaustive']);
  if (Object.keys(query).some(key => !supported.has(key) && query[key] != null)) return unsupported('One or more vector options are not implemented by the local evaluator.');
  if (query.exhaustive !== undefined && typeof query.exhaustive !== 'boolean') return invalid('The exhaustive option must be a boolean.');
  if (typeof query.fields !== 'string' || !query.fields.trim()) return invalid('A vector query requires a field name.');
  const names = query.fields.split(',').map(name => name.trim());
  for (const name of names) {
    if (!index.fields.some(field => field.name === name)) return invalid(`Unknown field '${name}' in vector field list.`, 'InvalidRequestParameter', 'UnknownField');
  }
  if (names.length !== 1) return unsupported('Multi-field vector fusion is not implemented by the local evaluator.');
  const field = index.fields.find(field => field.name === names[0]);
  if (field.type !== 'Collection(Edm.Single)' || field.searchable !== true || !field.vectorSearchProfile) return invalid(`Field '${field.name}' is not a searchable vector field.`);
  if (!Array.isArray(query.vector) || query.vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) return invalid('The vector must be an array of finite numbers.');
  if (query.vector.length !== field.dimensions) return invalid(`The vector has ${query.vector.length} dimensions, but field '${field.name}' requires ${field.dimensions}.`);
  if (!Number.isInteger(query.k) || query.k < 1 || query.k > 10000) return invalid('The vector query k must be an integer between 1 and 10000.');
  const profile = index.definition.vectorSearch?.profiles?.find(item => item.name === field.vectorSearchProfile);
  const algorithm = index.definition.vectorSearch?.algorithms?.find(item => item.name === profile?.algorithm);
  if (!algorithm || !['hnsw', 'exhaustiveKnn'].includes(algorithm.kind)) return invalid(`Field '${field.name}' has no supported vector algorithm.`);
  const metric = (algorithm.hnswParameters ?? algorithm.exhaustiveKnnParameters)?.metric ?? 'cosine';
  if (metric !== 'cosine') return unsupported('Only cosine vector similarity is implemented by the local evaluator.');
  const norm = Math.hypot(...query.vector);
  if (!norm) return invalid('A cosine query vector must have a nonzero magnitude.');
  // Exhaustive evaluation is suitable for small local fixtures. HNSW graph
  // construction, approximate recall and production performance are not modeled.
  const scored = documents.flatMap(document => {
    const vector = document[field.name];
    if (!Array.isArray(vector) || vector.length !== field.dimensions || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) return [];
    const magnitude = Math.hypot(...vector);
    if (!magnitude) return [];
    const cosine = Math.max(-1, Math.min(1, vector.reduce((sum, value, i) => sum + value * query.vector[i], 0) / (norm * magnitude)));
    return [{ document, score: 1 / (2 - cosine) }];
  });
  return { scored: scored.sort((a, b) => b.score - a.score).slice(0, query.k) };
}

export function evaluateSearch(index, request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.__invalidJson) return invalid('Search payload must be a JSON object.');
  const supported = new Set(['search', 'searchFields', 'searchMode', 'queryType', 'vectorQueries', 'skip', 'top', 'count', 'select']);
  if (Object.keys(request).some(key => !supported.has(key) && request[key] != null)) return unsupported('One or more query options are not implemented by the local evaluator.');
  if (request.queryType === 'semantic') return unsupported('Semantic query execution is not implemented by the local evaluator.');
  if (request.count !== undefined && typeof request.count !== 'boolean') return invalid('Search count must be a boolean.');
  let fields = index.fields.filter(field => field.retrievable ?? !field.vectorSearchProfile).map(field => field.name);
  if (request.select !== undefined && request.select !== '*') {
    if (typeof request.select !== 'string') return invalid('Search select must be a comma-separated string.');
    const names = request.select.split(',').map(name => name.trim());
    if (names.some(name => !fields.includes(name))) return invalid('A selected field is missing or is not retrievable.');
    fields = names;
  }
  const documents = [...index.documents.values()];
  let scored;
  if (request.vectorQueries !== undefined) {
    const result = vectorCandidates(index, documents, request);
    if (result.error) return result;
    scored = result.scored;
  } else {
    const result = textCandidates(index, documents, request);
    if (result.error) return result;
    scored = result.documents.map(document => ({ document, score: 1 }));
  }
  const skip = request.skip ?? 0, top = request.top ?? 50;
  if (!Number.isInteger(skip) || skip < 0 || skip > 100000 || !Number.isInteger(top) || top < 0 || top > 1000) return invalid('Search skip or top is outside the supported range.');
  const value = scored.slice(skip, skip + top).map(({ document, score }) => ({ '@search.score': score,
    ...Object.fromEntries(fields.filter(name => Object.hasOwn(document, name)).map(name => [name, document[name]])),
  }));
  return { body: { ...(request.count === true ? { '@odata.count': scored.length } : {}), value } };
}
