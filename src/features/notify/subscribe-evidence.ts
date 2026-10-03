import { collectClientEvidence, warmClientEvidence } from '@/features/comments/client/client-evidence';

const REFRESH_AGE_MS = 20 * 60 * 60_000;

/** Each opened form owns its token; optional probes never gate a subscription. */
export function subscriptionEvidence() {
  let token = '';
  let mintedAt = 0;
  let armedAt: number | undefined;
  let pending: Promise<void> | null = null;

  const mint = (): Promise<void> => {
    if (token && Date.now() - mintedAt < REFRESH_AGE_MS) return Promise.resolve();
    pending ??= fetch('/api/v2/comments/dwell-token', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2_000),
    }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { token?: unknown };
      if (typeof result.token === 'string') {
        token = result.token;
        mintedAt = Date.now();
      }
    }).catch(() => {}).finally(() => { pending = null; });
    return pending;
  };

  return {
    open() {
      armedAt ??= performance.now();
      warmClientEvidence();
      void mint();
    },
    async collect() {
      const [, evidence] = await Promise.all([
        mint(), collectClientEvidence({ kind: 'comment', armedAt }),
      ]);
      return { ...evidence, dwellToken: token || undefined };
    },
  };
}
