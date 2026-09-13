import type { ClientEvidence } from '@bunizao/contracts/comments';
import type { InteractionExtras } from './fingerprint';

type EvidenceModule = typeof import('./fingerprint');

const EVIDENCE_WAIT_MS = 2_000;
let loaded: EvidenceModule | null = null;
let loading: Promise<EvidenceModule | null> | null = null;

/** Start collecting only after a reader interacts with a compose box or heart. */
export function warmClientEvidence(): void {
  loading ??= import('./fingerprint').then((module) => {
    loaded = module;
    return module;
  }).catch(() => null);
}

/** Optional evidence shares one deadline across the import and every browser probe. */
export async function collectClientEvidence(extras: InteractionExtras): Promise<ClientEvidence> {
  if (!loading) return {};
  // Snapshot before waiting: another comment may be typed while this one sends.
  // An unloaded module did not observe this interaction, so omit its counters.
  const interaction = loaded?.interactionFor(extras);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ClientEvidence>((resolve) => {
    timer = setTimeout(() => resolve({}), EVIDENCE_WAIT_MS);
  });
  const collected = loading.then(async (module): Promise<ClientEvidence> => {
    if (!module) return {};
    const [clientFp, storageId] = await Promise.all([module.clientFingerprint(), module.storageId()]);
    return { clientFp, storageId, interaction };
  }).catch(() => ({}));
  try {
    return await Promise.race([collected, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
