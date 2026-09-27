import { getApiServiceBinding } from '@/lib/http/api-service-proxy';
import { readOptionalEnv, type RuntimeEnvLocals } from '@/lib/runtime/env';

/** Local `astro dev` with no site-api to talk to: no `API` binding and no
    `API_DEV_ORIGIN` (which `bun dev:api` sets). The portal then serves its
    in-memory demo API instead of proxying to production, where Cloudflare
    Access would refuse every call anyway. Always false in a build. */
export async function isPortalDemo(locals: RuntimeEnvLocals | undefined): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  if (readOptionalEnv(locals, 'API_DEV_ORIGIN')) return false;
  return !(await getApiServiceBinding(locals));
}
