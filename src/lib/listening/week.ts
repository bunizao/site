import type { ListeningWeek } from '@bunizao/contracts/listening';

/** The `week` of a `/api/v2/listening` body, or null when it is missing or malformed. */
export function parseListeningWeek(value: unknown): ListeningWeek | null {
  if (!value || typeof value !== 'object') return null;
  const { plays, topArtist } = value as { plays?: unknown; topArtist?: unknown };
  if (typeof plays !== 'number' || !Number.isSafeInteger(plays) || plays < 0) return null;
  if (topArtist !== null && (typeof topArtist !== 'string' || !topArtist.trim())) return null;
  return { plays, topArtist: topArtist?.trim() ?? null };
}
