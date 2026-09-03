import { readPublicEnv, type EnvSource, type RuntimeEnvLocals } from '@/lib/runtime/env';

/**
 * Returns the client key baked into Turnstile-enabled surfaces.
 *
 * Cloudflare's adapter injects default Wrangler vars while prerendering, so a
 * staging build needs its own explicit override. Production never defines the
 * override and continues through the ordinary public runtime variable.
 */
export function readTurnstileSiteKey(
  locals: RuntimeEnvLocals | undefined,
  buildEnv: EnvSource = import.meta.env as EnvSource,
): string {
  const stagingKey = buildEnv.PUBLIC_STAGING_TURNSTILE_SITE_KEY;
  if (typeof stagingKey === 'string' && stagingKey.trim()) return stagingKey.trim();
  return readPublicEnv(locals, 'TURNSTILE_SITE_KEY', buildEnv);
}
