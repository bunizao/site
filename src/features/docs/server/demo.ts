import { transformPostDirectives } from '../../posts/server/directives';

/* A docs demo shows the real thing, not a picture of it: the snippet in the
   fence is fed to the same directive pipeline a published post goes through,
   and the result is rendered underneath.

   The pipeline's input is the HTML the Ghost editor produces, so the snippet
   has to be turned into that first. The grammar below is the whole of what the
   editor does with typed text — a blank line starts a new block, a line break
   inside a block is a <br>, and a `>` prefix is a blockquote — which is also
   the whole of what a demo needs. Anything richer belongs in a real post. */

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/gu, (char) => ESCAPES[char] ?? char);
}

/** Ghost keeps a blockquote as one element of soft-broken lines, so a stanza
    break is the two consecutive <br>s an empty line produces here. */
function quoteBody(lines: readonly string[]): string {
  return lines.map((line) => (line.trim() ? escapeHtml(line) : '')).join('<br>');
}

function paragraph(lines: readonly string[]): string {
  return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
}

export function demoSourceToEditorHtml(source: string): string {
  const lines = source.replace(/\r\n/gu, '\n').replace(/\n+$/u, '').split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const quoted: string[] = [];
      while (index < lines.length && (lines[index] ?? '').startsWith('>')) {
        quoted.push((lines[index] ?? '').replace(/^>\s?/u, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteBody(quoted)}</blockquote>`);
      continue;
    }

    const body: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (!current.trim() || current.startsWith('>')) break;
      body.push(current);
      index += 1;
    }
    blocks.push(paragraph(body));
  }

  return blocks.join('');
}

async function renderDocsDemo(source: string): Promise<string> {
  const { html } = await transformPostDirectives(demoSourceToEditorHtml(source), {
    slug: 'docs-demo',
    locale: 'en',
    outputTarget: 'web',
  });
  // .blog-prose is where the directive styles are scoped; the demo is the same
  // markup a post gets, so it wants the same scope.
  return (
    '<figure class="docs-demo">' +
    '<figcaption class="docs-demo-label">Rendered</figcaption>' +
    `<div class="blog-prose docs-demo-render">${html}</div>` +
    '</figure>'
  );
}

const DEMO_SLOT_RE = /<div data-docs-demo="([A-Za-z0-9+/=]*)"><\/div>/gu;

/** Fills the slots the markdown plugin left behind. Runs in the docs route,
    which — unlike astro.config — can reach the directive pipeline. */
export async function expandDocsDemos(html: string): Promise<string> {
  const slots = [...html.matchAll(DEMO_SLOT_RE)];
  if (slots.length === 0) return html;

  const rendered = await Promise.all(
    slots.map((slot) => renderDocsDemo(Buffer.from(slot[1] ?? '', 'base64').toString('utf8'))),
  );

  let index = 0;
  return html.replace(DEMO_SLOT_RE, () => rendered[index++] ?? '');
}
