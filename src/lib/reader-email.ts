/* One remembered address per browser, shared by the two forms that ask for
   one: the blog comment box and the subscribe panel.

   They were asking the same reader for the same thing twice, in two places,
   with no memory between them -- so someone who had already subscribed still
   typed their address to comment, and someone who had already commented still
   typed it to subscribe. Whichever form gets it first hands it to the other.

   Deliberately small. Not an identity, not a proof, and never sent anywhere by
   this module: it only prefills a field the reader can overwrite. Comments
   keep their own richer `buxx:reader` record (name + email, written after a
   post); this is the lowest common denominator the subscribe panel can also
   write, since a subscriber has no display name to give. */

const KEY = 'buxx:email';

/** Where the address came from, kept only so a caller can tell whether the
    reader has already done the other thing. */
export type ReaderEmailSource = 'comment' | 'subscribe';

export interface ReaderEmail {
  email: string;
  source: ReaderEmailSource;
}

/** Never throws: private-mode and blocked-storage browsers get null, and both
    call sites treat that as "ask normally". */
export function readReaderEmail(): ReaderEmail | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReaderEmail>;
    if (typeof parsed?.email !== 'string' || !parsed.email) return null;
    return {
      email: parsed.email,
      source: parsed.source === 'subscribe' ? 'subscribe' : 'comment',
    };
  } catch {
    return null;
  }
}

export function rememberReaderEmail(email: string, source: ReaderEmailSource): void {
  const value = email.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ email: value, source }));
  } catch {
    // Storage refused. The reader types it again next time; nothing else
    // depends on this having worked.
  }
}
