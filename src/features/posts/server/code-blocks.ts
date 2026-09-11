import { load } from 'cheerio';
import { isConversationLanguage, renderConversation } from '@/features/content/conversation';
import { isMermaidLanguage } from '@/features/content/mermaid';
import { DIRECTIVE_SOURCE_RE } from './directives/syntax';

// Detects only the poem marker prefix, not a full `[!poem ...]` line: unlike
// other directives, everything after `]` is the poem's free-text title, so
// DIRECTIVE_SOURCE_RE (which anchors the whole line) cannot be reused here.
const POEM_MARKER_PREFIX_RE = /^\[!poem\]/iu;

export type BlogProseFragment =
  | { kind: 'html'; html: string }
  | { kind: 'code'; code: string; lang: string }
  | { kind: 'conversation'; source: string }
  | { kind: 'mermaid'; source: string };

interface SourceLocation {
  startOffset: number;
  endOffset: number;
}

interface CodeBlock {
  start: number;
  end: number;
  code: string;
  lang: string;
  declaredLanguage: string | null;
}

function sourceLocation(node: unknown): SourceLocation | null {
  return (node as { sourceCodeLocation?: SourceLocation }).sourceCodeLocation ?? null;
}

function declaredCodeLanguage(
  className: string | undefined,
  dataLanguage: string | undefined,
): string | null {
  const languageClass = className
    ?.split(/\s+/)
    .find((name) => name.startsWith('language-') || name.startsWith('lang-'));
  const language = languageClass?.replace(/^(?:language|lang)-/, '') || dataLanguage;

  return language?.toLowerCase() ?? null;
}

function findCodeBlocks(html: string): CodeBlock[] {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const blocks: CodeBlock[] = [];

  const addBlock = (container: unknown, codeElement: ReturnType<typeof $>) => {
    const location = sourceLocation(container);
    if (!location || codeElement.length === 0) return;

    const declaredLanguage = declaredCodeLanguage(
      codeElement.attr('class'),
      codeElement.attr('data-language'),
    );
    blocks.push({
      start: location.startOffset,
      end: location.endOffset,
      code: codeElement.text(),
      lang: declaredLanguage ?? 'text',
      declaredLanguage,
    });
  };

  $('figure.kg-code-card').each((_, figure) => {
    addBlock(figure, $(figure).find('pre code').first());
  });

  $('pre').each((_, pre) => {
    if ($(pre).closest('figure.kg-code-card').length > 0) return;
    addBlock(pre, $(pre).children('code').first());
  });

  blocks.sort((left, right) => left.start - right.start);
  return blocks;
}

export function splitBlogProse(html: string): BlogProseFragment[] {
  const blocks = findCodeBlocks(html);
  if (blocks.length === 0) return [{ kind: 'html', html }];

  const fragments: BlogProseFragment[] = [];
  let cursor = 0;

  for (const block of blocks) {
    if (block.start < cursor) continue;
    if (block.start > cursor) {
      fragments.push({ kind: 'html', html: html.slice(cursor, block.start) });
    }
    if (isConversationLanguage(block.lang)) {
      fragments.push({ kind: 'conversation', source: block.code });
    } else if (isMermaidLanguage(block.lang)) {
      fragments.push({ kind: 'mermaid', source: block.code });
    } else {
      fragments.push({ kind: 'code', code: block.code, lang: block.lang });
    }
    cursor = block.end;
  }

  if (cursor < html.length) {
    fragments.push({ kind: 'html', html: html.slice(cursor) });
  }

  return fragments;
}

/**
 * Draft previews keep ordinary Ghost code cards unchanged to avoid loading the
 * full CodeBox syntax-highlighting bundle into the Worker. Conversation cards
 * are lightweight and can still use the same renderer as published posts.
 */
export function promoteConversationBlocks(html: string): string {
  const blocks = findCodeBlocks(html).filter((block) => isConversationLanguage(block.lang));
  if (blocks.length === 0) return html;

  const fragments: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    if (block.start < cursor) continue;
    fragments.push(html.slice(cursor, block.start), renderConversation(block.code));
    cursor = block.end;
  }

  fragments.push(html.slice(cursor));
  return fragments.join('');
}

function escapeDirectiveMarkup(value: string): string {
  return value.replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

interface MarkerListBlock extends CodeBlock {
  kind: 'marker-list';
  sources: string[];
}

interface PoemBodyBlock extends CodeBlock {
  kind: 'poem-body';
  rawLines: string[];
}

type NormalizedDirectiveBlock = MarkerListBlock | PoemBodyBlock;

/**
 * The poem card writes its stanzas as plain lines: a blank line separates
 * stanzas (matching the `{2,}` consecutive-`<br>` threshold the hand-broken
 * blockquote form already splits on), and every other line joins the stanza
 * above it with a single `<br>`. Reassembling the marker and body this way
 * hands `poemDirective` the exact `<blockquote>` shape it already parses, so
 * the two authoring forms share one code path and produce identical HTML.
 */
function renderPoemBodyBlock(rawLines: string[]): string {
  const markerIndex = rawLines.findIndex((line) => line.trim().length > 0);
  const marker = escapeDirectiveMarkup(rawLines[markerIndex].trim());
  const bodyLines = rawLines.slice(markerIndex + 1);

  const htmlParts: string[] = [];
  let previousWasBlank = false;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      previousWasBlank = true;
      continue;
    }
    if (htmlParts.length > 0) htmlParts.push(previousWasBlank ? '<br><br>' : '<br>');
    htmlParts.push(escapeDirectiveMarkup(trimmed));
    previousWasBlank = false;
  }

  const body = htmlParts.join('');
  return `<blockquote>${marker}${body ? `<br>${body}` : ''}</blockquote>`;
}

/**
 * Ghost authors use an unlabelled code card as a stable carrier for custom
 * source syntax. Only blocks made entirely of registered markers are exposed
 * to the directive transformer; explicitly labelled code and partial examples
 * stay protected.
 *
 * A `directive`-labelled card gets one more shape: the poem card writes its
 * marker on the first line and the stanzas as the rest of the card body (see
 * `renderPoemBodyBlock`). That shape is specific to `poem` — every other
 * directive still only accepts one marker per line.
 */
export function normalizeDirectiveCodeBlocks(
  html: string,
  directiveNames: ReadonlySet<string>,
): string {
  const blocks = findCodeBlocks(html).flatMap((block): NormalizedDirectiveBlock[] => {
    if (block.declaredLanguage && block.declaredLanguage !== 'directive') return [];
    const rawLines = block.code.split(/\r?\n/u);
    const trimmedLines = rawLines.map((line) => line.trim()).filter(Boolean);
    if (trimmedLines.length === 0) return [];

    const allMarkers = trimmedLines.every((source) => {
      const match = DIRECTIVE_SOURCE_RE.exec(source);
      return Boolean(match && directiveNames.has(match[1].toLowerCase()));
    });
    if (allMarkers) return [{ ...block, kind: 'marker-list', sources: trimmedLines }];

    if (block.declaredLanguage === 'directive' && POEM_MARKER_PREFIX_RE.test(trimmedLines[0])) {
      return [{ ...block, kind: 'poem-body', rawLines }];
    }

    return [];
  });
  if (blocks.length === 0) return html;

  const fragments: string[] = [];
  let cursor = 0;

  for (const block of blocks) {
    if (block.start < cursor) continue;
    const source = block.kind === 'marker-list'
      ? block.sources
        .map((marker) => escapeDirectiveMarkup(marker))
        .map((marker) => `<p>${marker}</p>`)
        .join('')
      : renderPoemBodyBlock(block.rawLines);
    fragments.push(html.slice(cursor, block.start), source);
    cursor = block.end;
  }

  fragments.push(html.slice(cursor));
  return fragments.join('');
}
