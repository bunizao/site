const DIRECTIVE_ATTRIBUTES_SOURCE = `(?:[^"'\\]]|"[^"]*"|'[^']*')*`;

export const DIRECTIVE_SOURCE_RE = new RegExp(
  `^\\s*\\[!([a-z][a-z0-9-]*)(?:\\s+(${DIRECTIVE_ATTRIBUTES_SOURCE}))?\\]\\s*$`,
  'iu',
);

export const DIRECTIVE_PARAGRAPH_RE = new RegExp(
  `<p\\b[^>]*>\\s*\\[!([a-z][a-z0-9-]*)(?:\\s+(${DIRECTIVE_ATTRIBUTES_SOURCE}))?\\]\\s*</p>`,
  'giu',
);

export const DIRECTIVE_MARKER_RE =
  /\[!([a-z][a-z0-9-]*)(?:\s+[^\]]*?)?\]/giu;

export function findStandaloneDirectiveMarkers(
  html: string,
  directiveName: string,
): string[] {
  const markers: string[] = [];

  for (const match of html.matchAll(DIRECTIVE_PARAGRAPH_RE)) {
    if (match[1].toLowerCase() !== directiveName.toLowerCase()) continue;

    const paragraph = match[0];
    const start = paragraph.indexOf('[!');
    const end = paragraph.lastIndexOf(']');
    if (start >= 0 && end > start) {
      markers.push(paragraph.slice(start, end + 1));
    }
  }

  return markers;
}
