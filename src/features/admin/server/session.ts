import { readCloudflareAccessIdentity } from '@/features/admin/server/access';
import {
  readAdminDevBypassSession,
  type AdminSessionIdentity,
} from '@/features/admin/server/dev-bypass';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';

// The owner, or null. The /dev gate and the locked docs pages both ask this.
export async function readAdminSession(
  request: Request,
  locals: unknown,
): Promise<AdminSessionIdentity | null> {
  const env = locals as RuntimeEnvLocals | undefined;
  return readAdminDevBypassSession(env, request) ?? await readCloudflareAccessIdentity(request, env);
}
