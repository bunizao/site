// Authors reference a mood post a few ways: the convenient one is a short
// "[mood:ID]" token; Ghost also turns a pasted buxx.me/mood link into a bookmark
// card, and older posts hand-wrote an <iframe>. Hand-rolled iframes are the bug
// source — fixed heights clip the card, themes drift — so every form is
// normalized at build time into one canonical, responsive /mood/embed iframe.
// Prose.astro then grows it to content height and pushes the blog's theme.

const MOOD_EMBED_PATH = '/mood/embed';

interface MoodEmbedOptions {
  theme: 'auto' | 'light' | 'dark';
  density: 'regular' | 'compact';
}

function parseOptions(extra: string): Partial<MoodEmbedOptions> {
  const options: Partial<MoodEmbedOptions> = {};
  const theme = extra.match(/theme=(auto|light|dark)/i);
  if (theme) options.theme = theme[1].toLowerCase() as MoodEmbedOptions['theme'];
  const density = extra.match(/density=(regular|compact)/i);
  if (density) options.density = density[1].toLowerCase() as MoodEmbedOptions['density'];
  return options;
}

// Pull a numeric mood id out of either a "/mood/123" path or a "?id=123" query.
function extractMoodId(raw: string): string | null {
  const fromQuery = raw.match(/[?&]id=(\d+)/);
  if (fromQuery) return fromQuery[1];
  const fromPath = raw.match(/\/mood\/(\d+)/);
  return fromPath ? fromPath[1] : null;
}

function buildEmbedFigure(id: string, options: Partial<MoodEmbedOptions> = {}): string {
  const params = new URLSearchParams({
    id,
    theme: options.theme ?? 'auto',
    density: options.density ?? 'regular',
    link: 'false',
  });
  const src = `${MOOD_EMBED_PATH}?${params.toString()}`;
  return [
    `<figure class="kg-card blog-mood-embed" data-blog-mood-embed>`,
    `<iframe class="js-mood-embed" src="${src}" title="Mood post" loading="lazy"`,
    ` referrerpolicy="no-referrer" allowtransparency="true" height="320" style="width:100%;border:0;display:block"></iframe>`,
    `</figure>`,
  ].join('');
}

// A bookmark card or bare iframe Ghost produced for a mood URL — capture group 1
// is the href/src so we can lift the id and rebuild the embed from scratch.
const BOOKMARK_RE =
  /<figure[^>]*class="[^"]*kg-bookmark-card[^"]*"[^>]*>[\s\S]*?href="([^"]*\/mood\/\d+[^"]*)"[\s\S]*?<\/figure>/gi;
const IFRAME_FIGURE_RE =
  /<figure[^>]*>\s*<iframe[^>]*\bsrc="([^"]*\/mood\/embed[^"]*)"[^>]*>\s*<\/iframe>\s*<\/figure>/gi;
const BARE_IFRAME_RE =
  /<iframe[^>]*\bsrc="([^"]*\/mood\/embed[^"]*)"[^>]*>\s*<\/iframe>/gi;
// "[mood:123]" — alone in its own paragraph, or inline in surrounding text.
const SHORTCODE_BLOCK_RE = /<p>\s*\[mood:(\d+)([^\]]*)\]\s*<\/p>/gi;
const SHORTCODE_INLINE_RE = /\[mood:(\d+)([^\]]*)\]/gi;

export function enrichMoodEmbeds(html: string): string {
  if (!html) return html;

  let out = html;

  if (out.includes('[mood:')) {
    out = out
      .replace(SHORTCODE_BLOCK_RE, (_full, id: string, extra: string) =>
        buildEmbedFigure(id, parseOptions(extra)),
      )
      .replace(SHORTCODE_INLINE_RE, (_full, id: string, extra: string) =>
        buildEmbedFigure(id, parseOptions(extra)),
      );
  }

  if (out.includes('/mood/')) {
    const rebuild = (full: string, ref: string) => {
      const id = extractMoodId(ref);
      return id ? buildEmbedFigure(id, parseOptions(ref)) : full;
    };
    out = out
      .replace(BOOKMARK_RE, rebuild)
      .replace(IFRAME_FIGURE_RE, rebuild)
      .replace(BARE_IFRAME_RE, rebuild);
  }

  return out;
}
