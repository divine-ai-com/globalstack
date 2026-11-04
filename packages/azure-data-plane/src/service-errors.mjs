export function invalidRequest(code, publicMessage) {
  return Object.assign(new Error('Invalid service request.'), { status: 400, code, publicMessage });
}
