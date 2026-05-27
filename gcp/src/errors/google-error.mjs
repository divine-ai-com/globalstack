export function googleError(status, reason, message, details = []) {
  return {
    status,
    body: {
      error: {
        code: status,
        message,
        status: reason,
        details,
      },
    },
  };
}

export function unsupportedApiError(method, path) {
  return googleError(
    501,
    'UNIMPLEMENTED',
    `GlobalStack GCP does not implement ${method} ${path}. Unsupported behavior fails closed until backed by a real local engine or captured GCP evidence.`,
  );
}

export function notFoundError(resourceName) {
  return googleError(404, 'NOT_FOUND', `${resourceName} was not found.`);
}

export function invalidArgumentError(message) {
  return googleError(400, 'INVALID_ARGUMENT', message);
}

export function writeGoogleError(response, error) {
  response.statusCode = error.status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(error.body));
}
