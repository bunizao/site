/* Reader identity for people with no avatar on file.

   Both halves are pure functions of a seed string, so the same seed draws the
   same colour and the same letters on every render — server, client, and
   across reloads — without a lookup or a stored preference. Shared by the
   React reaction bar and the Astro thread so the two stacks agree. */

/** First letter of up to two name parts. Code-point aware, so CJK and emoji
    names yield one whole character rather than half a surrogate pair. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? '')
    .join('');
}

/** FNV-1a over the name, folded to a hue in [0, 360).

    Only the hue varies: lightness and chroma are fixed per theme in CSS, so
    every generated avatar lands on the same contrast step and no unlucky name
    draws an unreadable pair. */
export function seedHue(name: string): number {
  let hash = 0x811c9dc5;
  for (const char of name.trim().toLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

/** What to feed seedHue() for a comment row's generated avatar. A writer who
    supplied an email (`avatarUrl` resolved to something, even before that URL
    is ever rendered as an image) keeps a colour tied to their name, so the
    same person draws the same circle across every comment they post. A
    writer with no email has no such standing identity -- and anonymous
    writers disproportionately reuse the same handful of display names -- so
    those rows are seeded by the comment's own id instead, which never
    collides. */
export function avatarSeed(id: string, author: string, avatarUrl: string | undefined): string {
  return avatarUrl ? author : id;
}
