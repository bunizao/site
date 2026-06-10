import { readEnv, readRuntimeValue } from '@/lib/runtime/env';

interface TurnstileVerifyResponse {
  success?: boolean;
  'error-codes'?: string[];
  action?: string;
  hostname?: string;
}

export interface TurnstileVerificationResult {
  ok: boolean;
  skipped: boolean;
  code:
    | 'ok'
    | 'not_configured'
    | 'missing_token'
    | 'invalid_token'
    | 'hostname_mismatch'
    | 'action_mismatch'
    | 'verify_unavailable';
  errorCodes: string[];
}

interface TurnstileVerifyOptions {
  request: Request;
  locals?: any;
  token?: string;
  expectedAction?: string;
}

function readTurnstileSecret(locals?: any): string {
  return (
    readEnv(locals, 'TURNSTILE_SECRET_KEY')
    || readEnv(locals, 'CLOUDFLARE_TURNSTILE_SECRET_KEY')
    || ''
  ).trim();
}

function normalizeIpCandidate(value: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const candidate = trimmed.split(',')[0]?.trim() ?? '';
  if (!candidate) return '';
  if (candidate.length > 128) return '';
  if (!/^[a-z0-9:.[\]%-]+$/i.test(candidate)) return '';
  return candidate;
}

function getClientIp(request: Request, locals?: any): string {
  let runtimeClientIp = '';
  try {
    runtimeClientIp = typeof locals?.runtime?.ip === 'string' ? locals.runtime.ip : '';
  } catch {
    runtimeClientIp = '';
  }

  const runtimeIp =
    runtimeClientIp
    || readRuntimeValue(locals, 'REMOTE_ADDR')
    || '';
  const normalizedRuntimeIp = normalizeIpCandidate(runtimeIp);
  if (normalizedRuntimeIp) return normalizedRuntimeIp;

  const headerOrder = [
    'cf-connecting-ip',
    'x-real-ip',
    'true-client-ip',
    'fly-client-ip',
    'x-forwarded-for',
    'x-client-ip',
  ];

  for (const headerName of headerOrder) {
    const candidate = normalizeIpCandidate(request.headers.get(headerName));
    if (candidate) return candidate;
  }

  return '';
}

function normalizeHost(value: string): string {
  return value.replace(/^www\./i, '').toLowerCase();
}

function isAllowedHostname(challengeHostname: string, requestUrl: string): boolean {
  let requestHost = '';
  try {
    requestHost = new URL(requestUrl).hostname;
  } catch {
    return false;
  }

  return normalizeHost(challengeHostname) === normalizeHost(requestHost);
}

export async function verifyTurnstileToken(
  options: TurnstileVerifyOptions
): Promise<TurnstileVerificationResult> {
  const secret = readTurnstileSecret(options.locals);
  if (!secret) {
    return {
      ok: true,
      skipped: true,
      code: 'not_configured',
      errorCodes: [],
    };
  }

  const token = (options.token ?? '').trim();
  if (!token) {
    return {
      ok: false,
      skipped: false,
      code: 'missing_token',
      errorCodes: [],
    };
  }

  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);

  const clientIp = getClientIp(options.request, options.locals);
  if (clientIp) {
    params.set('remoteip', clientIp);
  }

  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch {
    return {
      ok: false,
      skipped: false,
      code: 'verify_unavailable',
      errorCodes: [],
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      code: 'verify_unavailable',
      errorCodes: [],
    };
  }

  let payload: TurnstileVerifyResponse;
  try {
    payload = (await response.json()) as TurnstileVerifyResponse;
  } catch {
    return {
      ok: false,
      skipped: false,
      code: 'verify_unavailable',
      errorCodes: [],
    };
  }

  if (!payload.success) {
    return {
      ok: false,
      skipped: false,
      code: 'invalid_token',
      errorCodes: payload['error-codes'] ?? [],
    };
  }

  if (payload.hostname && !isAllowedHostname(payload.hostname, options.request.url)) {
    return {
      ok: false,
      skipped: false,
      code: 'hostname_mismatch',
      errorCodes: payload['error-codes'] ?? [],
    };
  }

  if (options.expectedAction && payload.action && payload.action !== options.expectedAction) {
    return {
      ok: false,
      skipped: false,
      code: 'action_mismatch',
      errorCodes: payload['error-codes'] ?? [],
    };
  }

  return {
    ok: true,
    skipped: false,
    code: 'ok',
    errorCodes: payload['error-codes'] ?? [],
  };
}
