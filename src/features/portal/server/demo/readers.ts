/* Demo answers for revoked readers: the list a ban's `revokeReaderId`
   fills, and the restore that lifts it.

   Same paths, order and refusal as site-api (src/pages/admin/readers/* and
   features/comments/server/revoked-readers.ts there). Restore clears the
   revocation only: key bans stay, and purged comments come back only
   through the ban operation's own restore. A second restore is 409
   `reader_not_revoked`. There is no route that revokes a reader on its
   own; that happens only inside POST /admin/bans with keys.

   Dispatched from demo-api.ts. A unit test passes its own store; the dev
   server uses the one seeded below. Only imported behind
   `import.meta.env.DEV`. */

import type { AdminBannedReader, AdminBannedReaderListResult, AdminReaderRestoreResult } from '@bunizao/contracts';
import { demoBans } from './moderation';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** site-api reads at most this many. */
const REVOKED_LIST_LIMIT = 200;

export interface DemoReader extends AdminBannedReader {
  banned: boolean;
}

export interface ReadersStore {
  readers: DemoReader[];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code, message: code }, status);
}

function list(store: ReadersStore): Response {
  const readers = store.readers
    .filter((reader) => reader.banned)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, REVOKED_LIST_LIMIT)
    .map(({ banned: _banned, ...reader }) => reader);
  return json({ readers } satisfies AdminBannedReaderListResult);
}

function restore(store: ReadersStore, readerId: string): Response {
  const reader = store.readers.find((entry) => entry.readerId === readerId && entry.banned);
  if (!reader) return fail(409, 'reader_not_revoked');
  const now = new Date().toISOString();
  reader.banned = false;
  reader.updatedAt = now;
  return json({ readerId, restoredAt: now } satisfies AdminReaderRestoreResult);
}

/** Four revoked readers. The first carries the hash of `emailBan` when one
    is given, so the screen has a key ban that outlives the restore. */
export function seedReaders(now = Date.now(), emailBan: string | null = null): ReadersStore {
  const at = (ms: number) => new Date(now - ms).toISOString();
  return {
    readers: [
      { readerId: 'reader-d7e104', emailHash: emailBan ?? '6d19e5fb8ae6c7ce', email: 'devhk.2024@example.com', displayName: 'dev_hk', updatedAt: at(1.2 * DAY), banned: true },
      { readerId: 'reader-a3c55b', emailHash: '7e2af60c9bf7d8df', email: 'vip.signals@example.io', displayName: 'Crypto Signals', updatedAt: at(6 * DAY), banned: true },
      { readerId: 'reader-0f9b27', emailHash: '8f3b071dac08e9e0', email: 'no-name@example.net', displayName: null, updatedAt: at(13 * DAY + 5 * HOUR), banned: true },
      { readerId: 'reader-61e8c9', emailHash: '904c182ebd19fa01', email: 'j.lindqvist@example.se', displayName: 'jonas_k', updatedAt: at(27 * DAY), banned: true },
    ],
  };
}

/* One store per dev-server process, seeded on first use so the demo ban
   list exists to borrow an email hash from. */
let devStore: ReadersStore | null = null;

/** Back to the seed, for demo-api.ts's reset: the next request re-seeds
    from the ban list as it stands then, so reset the bans first. */
export function resetReadersDemo(): void {
  devStore = null;
}

function defaultStore(): ReadersStore {
  if (!devStore) {
    const now = Date.now();
    const emailBan = demoBans().find((ban) => ban.keyType === 'email' && (!ban.expiresAt || Date.parse(ban.expiresAt) > now));
    devStore = seedReaders(now, emailBan?.keyValue ?? null);
  }
  return devStore;
}

/** Answers `admin/readers/revoked` and `admin/readers/:id/restore`, or null
    for a path this module does not own. `segments` starts after `admin`. */
export async function handleReadersDemo(
  request: Request,
  segments: string[],
  store?: ReadersStore,
): Promise<Response | null> {
  const [resource, ...rest] = segments;
  if (resource !== 'readers') return null;
  const method = request.method.toUpperCase();
  if (rest.length === 1 && rest[0] === 'revoked' && method === 'GET') return list(store ?? defaultStore());
  if (rest.length === 2 && rest[1] === 'restore' && method === 'POST') return restore(store ?? defaultStore(), rest[0]);
  return null;
}
