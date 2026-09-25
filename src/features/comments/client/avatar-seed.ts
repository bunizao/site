// This browser's drawn face.
//
// Seeds come from site-api: the server picks colour classes the site is not
// already full of, which is how a new face avoids looking like the ones
// already on the page (see avatar-seed.ts there). A verified reader's seed is
// stored on their reader row, so the server answer is already theirs
// everywhere; anyone else keeps it in localStorage and posts it with each
// comment. Nothing here stores a seed on its own: the controller decides
// which answer wins, because a face chosen in the picker must not be
// overwritten by a first-seed request that lands after it.

import {
  AVATAR_OFFER_SIZE,
  isAvatarSeed,
  type AvatarSeedInput,
  type AvatarSeedOfferResult,
  type AvatarSeedResult,
} from '@bunizao/contracts/comments';
import { READER_AVATAR_SEED_PATH } from '@bunizao/contracts/routes';

const STORAGE_KEY = 'blog:avatar-seed';
/** A picker waiting on a stalled request is worse than local candidates. */
const REQUEST_TIMEOUT_MS = 4000;

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

async function post<T>(input: AvatarSeedInput): Promise<T | undefined> {
  try {
    const response = await fetch(`/api${READER_AVATAR_SEED_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
    });
    return response.ok ? ((await response.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** A first seed, in a different colour class from `current`. Undefined when
    the server cannot answer; the caller keeps what it has. */
export async function requestAvatarSeed(current: number | undefined): Promise<AvatarSeedResult | undefined> {
  const result = await post<AvatarSeedResult>({ current: current ?? null });
  return isAvatarSeed(result?.seed) ? result : undefined;
}

/** Five candidates for the picker. The server counts none of them, so asking
    for another batch costs the balance nothing. */
export async function requestAvatarOffer(current: number | undefined): Promise<number[] | undefined> {
  const result = await post<AvatarSeedOfferResult>({ current: current ?? null, mode: 'offer' });
  const seeds = result?.seeds;
  return Array.isArray(seeds) && seeds.length === AVATAR_OFFER_SIZE && seeds.every(isAvatarSeed) ? seeds : undefined;
}

/** Tells the server which face the reader picked: it counts the class, and
    keeps the seed on the reader row when the reader is verified. */
export async function sendAvatarChoice(seed: number, current: number | undefined): Promise<AvatarSeedResult | undefined> {
  const result = await post<AvatarSeedResult>({ current: current ?? null, mode: 'choose', seed });
  return isAvatarSeed(result?.seed) ? result : undefined;
}
