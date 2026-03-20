import type { APIContext } from 'astro';

function readEnv(locals: APIContext['locals'], name: string): string {
  const envSource = ((import.meta as { env?: Record<string, string | undefined> }).env) || {};
  const buildValue = envSource[name];
  if (typeof buildValue === 'string' && buildValue.trim()) {
    return buildValue.trim();
  }

  const runtimeValue =
    locals?.runtime?.env?.[name]
    ?? locals?.env?.[name];
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) {
    return runtimeValue.trim();
  }

  return '';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readRoomIdFromReferer(referer: string): string {
  if (!referer) return '';
  try {
    const url = new URL(referer);
    return url.searchParams.get('room')?.trim() || '';
  } catch {
    return '';
  }
}

export function getOfficeAssetsWorkerUrl(context: APIContext): string {
  return trimTrailingSlash(
    readEnv(context.locals, 'OFFICE_ASSETS_WORKER_URL')
    || readEnv(context.locals, 'PUBLIC_OFFICE_ASSETS_WORKER_URL'),
  );
}

export function getOfficeAssetsRoomId(context: APIContext): string {
  const requestUrl = context.url || new URL(context.request.url);

  return context.request.headers.get('x-office-room-id')?.trim()
    || requestUrl.searchParams.get('room')?.trim()
    || readRoomIdFromReferer(context.request.headers.get('referer') || '')
    || readEnv(context.locals, 'PUBLIC_AGENTS_OFFICE_ROOM_ID')
    || 'demo';
}

export function unsupportedOfficeAssetsResponse(): Response {
  return new Response(JSON.stringify({
    ok: false,
    unsupported: true,
    msg: 'Unsupported in Worker-backed office runtime.',
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function forwardOfficeAssetsRequest(
  context: APIContext,
  pathname?: string,
): Promise<Response | null> {
  const requestUrl = context.url || new URL(context.request.url);
  const workerUrl = getOfficeAssetsWorkerUrl(context);
  if (!workerUrl) {
    return null;
  }

  const targetUrl = new URL(`${workerUrl}${pathname || requestUrl.pathname}${requestUrl.search}`);
  const headers = new Headers(context.request.headers);
  if (!headers.get('x-office-room-id')) {
    headers.set('x-office-room-id', getOfficeAssetsRoomId(context));
  }
  headers.delete('host');
  headers.delete('content-length');

  const hasBody = !['GET', 'HEAD'].includes(context.request.method);
  const body = hasBody ? await context.request.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl, {
    method: context.request.method,
    headers,
    body,
    redirect: 'manual',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: new Headers(upstream.headers),
  });
}
