import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

export interface AdminSessionIdentity {
  login: string;
  email?: string;
  avatarUrl?: string;
}

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// A tunnel such as `dev:phone:tunnel` rewrites the Host header to localhost,
// so the hostname alone cannot tell a local request from a public one.
// Cloudflare stamps these headers on every request it forwards.
function arrivedThroughCloudflare(request: Request): boolean {
  return request.headers.has('cf-ray') || request.headers.has('cf-connecting-ip');
}

export function readAdminDevBypassSession(
  locals: RuntimeEnvLocals | undefined,
  request: Request,
): AdminSessionIdentity | null {
  if (
    !LOCAL_DEV_HOSTNAMES.has(new URL(request.url).hostname)
    || arrivedThroughCloudflare(request)
    || readOptionalEnv(locals, 'ADMIN_DEV_BYPASS') !== '1'
  ) {
    return null;
  }

  return {
    login: readOptionalEnv(locals, 'ADMIN_DEV_LOGIN') ?? 'admin',
    email: readOptionalEnv(locals, 'ADMIN_DEV_EMAIL'),
    avatarUrl: readOptionalEnv(locals, 'ADMIN_DEV_AVATAR_URL'),
  };
}
