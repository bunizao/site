// This browser's drawn face.
//
// A seed comes from site-api, never from Math.random here: the server picks
// the least-used colour class across the site, which is how a new face
// avoids looking like the ones already on the page (see avatar-seed.ts
// there). A verified reader's seed is stored on their reader row, so the
// server answer is already theirs everywhere; anyone else keeps it in
// localStorage and posts it with each comment.

import { isAvatarSeed, type AvatarSeedInput, type AvatarSeedResult } from '@bunizao/contracts/comments';
import { READER_AVATAR_SEED_PATH } from '@bunizao/contracts/routes';

const STORAGE_KEY = 'blog:avatar-seed';

export function readAvatarSeed(): number | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return isAvatarSeed(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function rememberAvatarSeed(seed: number | null | undefined): void {
  if (!isAvatarSeed(seed)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(seed));
  } catch {
    // Private mode: the face still changes on screen, it just is not kept.
  }
}

/** Asks for a seed in a different colour class from `current`. Resolves to
    undefined when the server cannot answer; the caller keeps what it has. */
export async function requestAvatarSeed(current: number | undefined): Promise<AvatarSeedResult | undefined> {
  try {
    const response = await fetch(`/api${READER_AVATAR_SEED_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: current ?? null } satisfies AvatarSeedInput),
    });
    if (!response.ok) return undefined;
    const result = (await response.json()) as AvatarSeedResult;
    if (!isAvatarSeed(result?.seed)) return undefined;
    rememberAvatarSeed(result.seed);
    return result;
  } catch {
    return undefined;
  }
}
