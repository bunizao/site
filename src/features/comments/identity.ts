/* Reader identity for people with no avatar on file.

   Both halves are pure functions of the name, so the same person is the same
   colour and the same letters on every render — server, client, and across
   reloads — without a lookup or a stored preference. Shared by the React
   reaction bar and the Astro thread so the two stacks agree. */

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
