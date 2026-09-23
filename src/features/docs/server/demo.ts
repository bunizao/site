import { isConversationLanguage } from '../../content/conversation';
import { transformPostDirectives } from '../../posts/server/directives';
import {
  readAuthorshipCredits,
  type AuthorshipCredit,
} from '../../posts/server/directives/authors';

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

/** A block directive occupies its own paragraph — in the editor it is a line the
    author ended with Enter, not Shift+Enter, and the pipeline only matches one
    that owns its whole block. Two of them listed under each other in a fence
    are still two blocks. */
const BLOCK_DIRECTIVE = /^\[![a-z][\w-]*(?:\s[^\]]*)?\]$/iu;

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

    if (BLOCK_DIRECTIVE.test(line.trim())) {
      blocks.push(paragraph([line.trim()]));
      index += 1;
      continue;
    }

    const body: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? '';
      if (!current.trim() || current.startsWith('>') || BLOCK_DIRECTIVE.test(current.trim())) break;
      body.push(current);
      index += 1;
    }
    blocks.push(paragraph(body));
  }

  return blocks.join('');
}

/* A conversation demo arrives two ways. `conversation` fences are the thread on
   its own; a `markdown` fence is the whole thing an author pastes into an
   editor, outer backticks included. Both should render the same thread, so the
   wrapper is unwrapped rather than given a second code path. */
const WRAPPED_CONVERSATION = /^`{3,}[ \t]*conversation[ \t]*\n([\s\S]*?)\n`{3,}\s*$/u;

/** The thread source inside a demo fence, or null when the fence is not one. */
export function readConversationSource(lang: string, source: string): string | null {
  if (isConversationLanguage(lang)) return source;
  return WRAPPED_CONVERSATION.exec(source.trim())?.[1] ?? null;
}

export interface DemoRender {
  /** Post body HTML, empty when the snippet is nothing but meta directives. */
  html: string;
  /** What `[!authors]` put in the footer. Empty for every other snippet. */
  credits: readonly AuthorshipCredit[];
}

/** Runs a snippet through the post pipeline and hands back both halves of what
    a post would show: the body, and the footer credit a meta directive yields.
    `[!authors]` renders nothing in place, so without the second half its demo
    would be an empty box. */
export async function renderDemo(source: string): Promise<DemoRender> {
  const { html, meta } = await transformPostDirectives(demoSourceToEditorHtml(source), {
    slug: 'docs-demo',
    locale: 'en',
    outputTarget: 'web',
  });
  return { html, credits: readAuthorshipCredits(meta, 'docs-demo') };
}

export type DocsFragment =
  | { kind: 'html'; html: string }
  | { kind: 'demo'; lang: string; source: string };

const DEMO_SLOT_RE = /<div data-docs-demo="([A-Za-z0-9+/=]*)" data-docs-demo-lang="([a-z0-9-]*)"><\/div>/gu;

/** Splits rendered docs HTML around the slots the markdown plugin left behind.
    A slot cannot be filled here because a demo may need a component — the
    conversation thread, the authorship credit — so the route renders them and
    this only says where they go. */
export function splitDocsFragments(html: string): DocsFragment[] {
  const fragments: DocsFragment[] = [];
  let cursor = 0;

  for (const slot of html.matchAll(DEMO_SLOT_RE)) {
    const start = slot.index ?? 0;
    if (start > cursor) fragments.push({ kind: 'html', html: html.slice(cursor, start) });
    fragments.push({
      kind: 'demo',
      lang: slot[2] ?? '',
      source: Buffer.from(slot[1] ?? '', 'base64').toString('utf8'),
    });
    cursor = start + slot[0].length;
  }

  if (cursor < html.length) fragments.push({ kind: 'html', html: html.slice(cursor) });
  return fragments;
}
