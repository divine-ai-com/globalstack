// Keep report values inside one Markdown table cell without creating HTML or escapes.
export function markdownCell(value) {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '|': '&#124;', '\\': '&#92;', '\r': ' ', '\n': ' ' };
  return String(value ?? '').replace(/[&<>"'|\\\r\n]/g, character => escapes[character]);
}
