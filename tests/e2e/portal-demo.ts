import type { PlaywrightWorkerArgs } from '@playwright/test';

const API = '/dev/portal/api/admin';

/* Puts the portal's in-memory demo store back to its seed, so a spec leaves
   the dev server as it found it. Every portal spec calls it in `beforeAll`
   and `afterAll`; the `portal` project runs those files one at a time, so a
   reset never lands in the middle of another file.

   `request` is test-scoped, so the hooks build their own context. The probe
   makes sure the answer comes from the demo API: against a real site-api
   (`bun dev:api`) nothing is sent. */
export async function resetPortalDemo(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string): Promise<void> {
  const request = await playwright.request.newContext({ baseURL });
  try {
    const probe = await request.get(`${API}/session`);
    if (probe.headers()['x-portal-demo'] !== '1') return;
    const reset = await request.post(`${API}/__demo/reset`);
    if (!reset.ok()) throw new Error(`Portal demo reset failed: ${reset.status()}`);
  } finally {
    await request.dispose();
  }
}
