function createJsonHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  if (!next.has('Content-Type')) {
    next.set('Content-Type', 'application/json');
  }
  return next;
}

export function json(status: number, data: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: createJsonHeaders(headers),
  });
}

export function jsonOk(data: unknown, headers?: HeadersInit): Response {
  return json(200, data, headers);
}

export function jsonError(
  status: number,
  error: string,
  headers?: HeadersInit,
  extras?: Record<string, unknown>
): Response {
  return json(status, { error, ...(extras ?? {}) }, headers);
}

export function jsonBadRequest(
  error: string,
  headers?: HeadersInit,
  extras?: Record<string, unknown>
): Response {
  return jsonError(400, error, headers, extras);
}

export function jsonTooManyRequests(headers?: HeadersInit): Response {
  return jsonError(429, 'Too Many Requests', headers);
}
