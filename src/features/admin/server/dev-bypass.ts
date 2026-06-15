import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

export interface AdminSessionIdentity {
  login: string;
  avatarUrl?: string;
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function readAdminDevBypassSession(
  locals: RuntimeEnvLocals | undefined,
  hostname: string,
): AdminSessionIdentity | null {
  if (!isLocalDevHost(hostname) || readOptionalEnv(locals, 'ADMIN_DEV_BYPASS') !== '1') {
    return null;
  }

  return {
    login: readOptionalEnv(locals, 'ADMIN_DEV_LOGIN') ?? 'admin',
    avatarUrl: readOptionalEnv(locals, 'ADMIN_DEV_AVATAR_URL'),
  };
}
