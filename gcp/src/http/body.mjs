export async function readRequestText(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readRequestJson(request) {
  const text = await readRequestText(request);
  if (!text) return {};
  return JSON.parse(text);
}

export function writeJson(response, statusCode, body, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=UTF-8');
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
  response.end(JSON.stringify(body));
}

export function writeEmpty(response, statusCode = 204) {
  response.statusCode = statusCode;
  response.end();
}
