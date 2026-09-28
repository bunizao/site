/* Every portal read and write goes through the same-origin proxy at
   /dev/portal/api/*, which attaches the admin identity and forwards to
   site-api's /api/admin/*. Paths below are relative to /api/. */

export const API_BASE = '/dev/portal/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

export function apiUrl(path: string, params?: Params): string {
  const url = new URL(`${API_BASE}/${path.replace(/^\/+/, '')}`, location.origin);
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(name, String(value));
  }
  return url.pathname + url.search;
}

/* Dev-only demo switches: `?demoFail=<path prefix>` (or `*`) makes the demo
   API answer those paths with a 500, `?demoDelay=<ms>` sets its latency.
   Read from whatever URL is open and remembered until a URL sets them
   again (an empty value clears), then forwarded as headers the demo API
   reads (server/demo-api.ts). Every use sits behind `import.meta.env.DEV`,
   so a production build drops all of it. */
const demoSwitches: Record<string, string> = {};

function demoHeaders(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  for (const [param, header] of [['demoFail', 'x-portal-demo-fail'], ['demoDelay', 'x-portal-demo-delay']]) {
    const value = params.get(param);
    if (value === null) continue;
    if (value) demoSwitches[header] = value;
    else delete demoSwitches[header];
  }
  return { ...demoSwitches };
}

function headers(base: Record<string, string>): Record<string, string> {
  return import.meta.env.DEV ? { ...base, ...demoHeaders() } : base;
}

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    const code = payload?.error ?? null;
    throw new ApiError(response.status, code, payload?.message ?? code ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

export async function apiGet<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(path, params), { headers: headers({ accept: 'application/json' }), signal });
  return parse<T>(response);
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  options: { keepalive?: boolean } = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method,
    headers: headers(body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: options.keepalive,
  });
  return parse<T>(response);
}

/** A route or act this site-api does not have yet: a portal ahead of its
    backend. An unknown path is a 404 with no JSON code (the demo names it
    `demo_not_implemented`) or a 405. A caller that knows the backend would
    misroute a call refuses it locally as `needs_site_api_update` (see
    comments/data.ts). A 404 with a code is a real missing item. */
export function isMissingRoute(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'needs_site_api_update' || error.status === 405) return true;
  return error.status === 404 && (error.code === null || error.code === 'demo_not_implemented');
}

/** A 4xx, as the missing route would answer, so queries do not retry it. */
export function needsSiteApiUpdate(): ApiError {
  return new ApiError(404, 'needs_site_api_update', 'needs_site_api_update');
}

export const MISSING_ROUTE_MESSAGE = 'This needs the updated site-api, which is not deployed yet. Nothing was changed.';

/** Human copy for a failed call. Every message says what to do next. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (isMissingRoute(error)) return MISSING_ROUTE_MESSAGE;
    if (error.status === 401 || error.status === 403) return 'Your admin session has expired. Reload the page to sign in again.';
    if (error.status === 409) return 'Someone already handled this, probably from Telegram. The list has been refreshed.';
    if (error.status === 404) return 'That item no longer exists. The list has been refreshed.';
    if (error.status >= 500) return `site-api failed (${error.code ?? error.status}). Try again in a moment.`;
    return `${error.message}. Check the input and try again.`;
  }
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
