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

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!response.ok) {
    const code = payload?.error ?? null;
    throw new ApiError(response.status, code, payload?.message ?? code ?? `HTTP ${response.status}`);
  }
  return payload as T;
}

export async function apiGet<T>(path: string, params?: Params, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(path, params), { headers: { accept: 'application/json' }, signal });
  return parse<T>(response);
}

export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  options: { keepalive?: boolean } = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method,
    headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: options.keepalive,
  });
  return parse<T>(response);
}

/** Human copy for a failed call. Every message says what to do next. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'Your admin session has expired. Reload the page to sign in again.';
    if (error.status === 409) return 'Someone already handled this, probably from Telegram. The list has been refreshed.';
    if (error.status === 404) return 'That item no longer exists. The list has been refreshed.';
    if (error.status >= 500) return `site-api failed (${error.code ?? error.status}). Try again in a moment.`;
    return `${error.message}. Check the input and try again.`;
  }
  if (error instanceof TypeError) return 'Could not reach the server. Check your connection and try again.';
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}
