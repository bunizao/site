interface AcceptEntry {
  mediaType: string;
  q: number;
  order: number;
}

function parseQ(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

function parseAccept(accept: string | null): AcceptEntry[] {
  if (!accept?.trim()) return [];

  return accept
    .split(',')
    .map((part, order): AcceptEntry | null => {
      const [rawMediaType, ...rawParams] = part.split(';');
      const mediaType = rawMediaType.trim().toLowerCase();
      if (!mediaType || !mediaType.includes('/')) return null;

      const qParam = rawParams
        .map((param) => param.trim())
        .find((param) => param.toLowerCase().startsWith('q='));
      const q = parseQ(qParam?.slice(2).trim());

      return { mediaType, q, order };
    })
    .filter((entry): entry is AcceptEntry => Boolean(entry));
}

function specificityFor(mediaType: string, expected: string): number | null {
  if (mediaType === expected) return 2;

  const [type] = expected.split('/');
  if (mediaType === `${type}/*`) return 1;
  if (mediaType === '*/*') return 0;

  return null;
}

function qualityFor(entries: AcceptEntry[], expected: string): number {
  let best: { q: number; specificity: number; order: number } | null = null;

  for (const entry of entries) {
    const specificity = specificityFor(entry.mediaType, expected);
    if (specificity == null) continue;

    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && entry.order < best.order)
    ) {
      best = { q: entry.q, specificity, order: entry.order };
    }
  }

  return best?.q ?? 0;
}

export function prefersMarkdown(accept: string | null): boolean {
  const entries = parseAccept(accept);
  const explicitMarkdown = entries.some((entry) => entry.mediaType === 'text/markdown' && entry.q > 0);

  if (!explicitMarkdown) return false;

  const markdownQ = qualityFor(entries, 'text/markdown');
  const htmlQ = qualityFor(entries, 'text/html');

  return markdownQ > 0 && markdownQ >= htmlQ;
}

export function estimateMarkdownTokens(markdown: string): number {
  if (!markdown) return 0;
  return Math.ceil(markdown.length / 4);
}
