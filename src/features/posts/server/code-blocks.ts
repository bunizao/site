import { load } from 'cheerio';
import { isConversationLanguage } from '@/features/content/conversation';

export type BlogProseFragment =
  | { kind: 'html'; html: string }
  | { kind: 'code'; code: string; lang: string }
  | { kind: 'conversation'; source: string };

interface SourceLocation {
  startOffset: number;
  endOffset: number;
}

interface CodeBlock {
  start: number;
  end: number;
  code: string;
  lang: string;
}

function sourceLocation(node: unknown): SourceLocation | null {
  return (node as { sourceCodeLocation?: SourceLocation }).sourceCodeLocation ?? null;
}

function codeLanguage(className: string | undefined, dataLanguage: string | undefined): string {
  const languageClass = className
    ?.split(/\s+/)
    .find((name) => name.startsWith('language-') || name.startsWith('lang-'));

  return (languageClass?.replace(/^(?:language|lang)-/, '') || dataLanguage || 'text').toLowerCase();
}

export function splitBlogProse(html: string): BlogProseFragment[] {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const blocks: CodeBlock[] = [];

  const addBlock = (container: unknown, codeElement: ReturnType<typeof $>) => {
    const location = sourceLocation(container);
    if (!location || codeElement.length === 0) return;

    blocks.push({
      start: location.startOffset,
      end: location.endOffset,
      code: codeElement.text(),
      lang: codeLanguage(codeElement.attr('class'), codeElement.attr('data-language')),
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
  if (blocks.length === 0) return [{ kind: 'html', html }];

  const fragments: BlogProseFragment[] = [];
  let cursor = 0;

  for (const block of blocks) {
    if (block.start < cursor) continue;
    if (block.start > cursor) {
      fragments.push({ kind: 'html', html: html.slice(cursor, block.start) });
    }
    fragments.push(
      isConversationLanguage(block.lang)
        ? { kind: 'conversation', source: block.code }
        : { kind: 'code', code: block.code, lang: block.lang }
    );
    cursor = block.end;
  }

  if (cursor < html.length) {
    fragments.push({ kind: 'html', html: html.slice(cursor) });
  }

  return fragments;
}
