// A bounded OData subset used by native Table clients. Unsupported syntax is
// rejected; never evaluate client-provided JavaScript or silently drop a clause.
export function tableFilter(source) {
  if (!source) return () => true;
  const unsupported = () => { throw new Error('Only string equality, and, or and parentheses are implemented for Table filters.'); };
  if (source.length > 8192) unsupported();
  const tokens = []; let offset = 0;
  while (offset < source.length) {
    const whitespace = /^\s+/.exec(source.slice(offset));
    if (whitespace) { offset += whitespace[0].length; continue; }
    const match = /^(?:'((?:[^']|'')*)'|([A-Za-z_][A-Za-z0-9_]*)|([()]))/.exec(source.slice(offset));
    if (!match || tokens.length >= 128) unsupported();
    tokens.push(match[1] !== undefined ? { string: match[1].replaceAll("''", "'") } : match[2] ?? match[3]);
    offset += match[0].length;
  }
  let position = 0, comparisons = 0;
  function atom(depth) {
    if (depth > 16) unsupported();
    if (tokens[position] === '(') {
      position++; const expression = or(depth + 1);
      if (tokens[position++] !== ')') unsupported();
      return expression;
    }
    const field = tokens[position++], operator = tokens[position++], value = tokens[position++];
    if (typeof field !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field) || operator !== 'eq'
      || !value || typeof value !== 'object' || ++comparisons > 15) unsupported();
    return entity => Object.hasOwn(entity, field) && entity[field] === value.string;
  }
  function and(depth) {
    let expression = atom(depth);
    while (tokens[position] === 'and') {
      position++; const left = expression, right = atom(depth);
      expression = entity => left(entity) && right(entity);
    }
    return expression;
  }
  function or(depth) {
    let expression = and(depth);
    while (tokens[position] === 'or') {
      position++; const left = expression, right = and(depth);
      expression = entity => left(entity) || right(entity);
    }
    return expression;
  }
  const predicate = or(0);
  if (position !== tokens.length) unsupported();
  return predicate;
}
