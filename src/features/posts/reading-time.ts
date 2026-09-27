// Shared by the Ghost dataset and the mock posts, so fixture reading times are
// computed exactly the way production ones are.

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// CJK scripts have no inter-word spaces, so whitespace splitting collapses a
// whole Chinese article to a handful of "words" and pins it at "1 min read".
// Count CJK characters directly (~350/min) and the remaining Latin runs by
// whitespace word (~220/min), then sum the two estimates.
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g;

export function readingTimeFromText(text: string): string {
  const cjkChars = (text.match(CJK_RE) || []).length;
  const words = text.replace(CJK_RE, ' ').split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(cjkChars / 350 + words / 220));

  return minutes === 1 ? '1 min read' : `${minutes} min read`;
}
