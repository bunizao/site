import { load } from 'cheerio';

import { enrichAppleMusicEmbeds } from '../apple-music';
import { enrichMoodEmbeds } from '../mood-embed';
import { DirectiveAttributeError } from './attributes';
import { footnotesDirective } from './footnotes';
import { moodDirective } from './mood';
import { musicDirective } from './music';
import { poemDirective } from './poem';
import { isRichDirectiveOutputTarget } from './types';
import type {
  Directive,
  DirectiveAttributes,
  DirectiveContext,
  DirectiveHtmlOutput,
  DirectiveTransformResult,
  DirectiveTransformer,
  DirectiveWarning,
  InlineDirective,
} from './types';

export type {
  BlockDirective,
  Directive,
  DirectiveAttributes,
  DirectiveContext,
  DirectiveHtmlOutput,
  DirectiveOutputTarget,
  DirectiveTransformResult,
  DirectiveTransformer,
  DirectiveWarning,
  InlineDirective,
  MetaDirective,
} from './types';

const DIRECTIVE_PARAGRAPH_RE =
  /<p\b[^>]*>\s*\[!([a-z][a-z0-9-]*)(?:\s+((?:[^"'\]]|"[^"]*"|'[^']*')*))?\]\s*<\/p>/giu;
const DIRECTIVE_MARKER_RE = /\[!([a-z][a-z0-9-]*)(?:\s+[^\]]*?)?\]/giu;
const PROTECTED_SELECTOR = 'code, pre, script, style';

export const postDirectiveRegistry: readonly Directive[] = Object.freeze([
  poemDirective,
  footnotesDirective,
  moodDirective,
  musicDirective,
]);

interface SourceRange {
  start: number;
  end: number;
  tagName: string;
}

interface MaskedDocument {
  maskedHtml: string;
  restore(value: string): string;
}

export function createDirectiveTransformer(
  directives: readonly Directive[],
): DirectiveTransformer {
  const byName = new Map<string, Directive>();
  for (const directive of directives) {
    const name = directive.name.toLowerCase();
    if (byName.has(name)) {
      throw new Error(`Duplicate directive name "${name}".`);
    }
    byName.set(name, directive);
  }
  const inlineDirectives = directives.filter(
    (directive): directive is InlineDirective => directive.kind === 'inline',
  );

  return async (html, context) => {
    const maskedDocument = maskProtectedHtml(html);
    const result = await transformCallouts(maskedDocument.maskedHtml, context, byName);
    for (const directive of inlineDirectives) {
      const maskedInlineInput = maskProtectedHtml(result.html);
      const output = resolveHtmlOutput(
        await directive.transform(maskedInlineInput.maskedHtml, context),
      );
      result.html = maskedInlineInput.restore(output.html);
      result.warnings.push(...output.warnings);
    }
    result.warnings.push(
      ...collectUnknownDirectiveWarnings(maskedDocument.maskedHtml, context, byName),
    );
    result.html = maskedDocument.restore(result.html);
    return result;
  };
}

const transformRegisteredPostDirectives = createDirectiveTransformer(postDirectiveRegistry);

export const transformPostDirectives: DirectiveTransformer = async (html, context) => {
  let input = html;
  if (isRichDirectiveOutputTarget(context.outputTarget)) {
    const maskedDocument = maskProtectedHtml(input);
    const enrichedMoodHtml = enrichMoodEmbeds(maskedDocument.maskedHtml);
    input = maskedDocument.restore(await enrichAppleMusicEmbeds(enrichedMoodHtml));
  }
  return transformRegisteredPostDirectives(input, context);
};

function resolveHtmlOutput(output: DirectiveHtmlOutput): {
  html: string;
  warnings: readonly DirectiveWarning[];
} {
  return typeof output === 'string'
    ? { html: output, warnings: [] }
    : { html: output.html, warnings: output.warnings ?? [] };
}

function maskProtectedHtml(html: string): MaskedDocument {
  const ranges = findProtectedRanges(html);
  if (ranges.length === 0) {
    return { maskedHtml: html, restore: (value) => value };
  }

  let salt = 0;
  let prefix = '';
  do {
    prefix = `\u{e000}blog-directive-${salt}-`;
    salt += 1;
  } while (html.includes(prefix));

  const replacements: Array<{ token: string; html: string }> = [];
  let cursor = 0;
  let masked = '';

  for (const [index, range] of ranges.entries()) {
    const token = `${prefix}${range.tagName}-${index}\u{e001}`;
    masked += html.slice(cursor, range.start) + token;
    replacements.push({ token, html: html.slice(range.start, range.end) });
    cursor = range.end;
  }
  masked += html.slice(cursor);

  return {
    maskedHtml: masked,
    restore(value) {
      let restored = value;
      for (const replacement of replacements) {
        const first = restored.indexOf(replacement.token);
        const duplicate = first >= 0
          ? restored.indexOf(replacement.token, first + replacement.token.length)
          : -1;
        if (first < 0 || duplicate >= 0) {
          throw new Error('A directive changed protected HTML content.');
        }
        restored = restored.replace(replacement.token, replacement.html);
      }
      return restored;
    },
  };
}

function findProtectedRanges(html: string): SourceRange[] {
  if (!/<(?:code|pre|script|style)\b/iu.test(html)) return [];

  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const ranges: SourceRange[] = [];

  $(PROTECTED_SELECTOR).each((_, element) => {
    const location = element.sourceCodeLocation;
    if (!location) return;
    ranges.push({
      start: location.startOffset,
      end: location.endOffset,
      tagName: element.tagName.toLowerCase(),
    });
  });

  ranges.sort((left, right) => left.start - right.start || right.end - left.end);

  const merged: SourceRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.start >= previous.end) {
      merged.push({ ...range });
    } else if (range.end > previous.end) {
      previous.end = range.end;
    }
  }

  return merged;
}

function collectUnknownDirectiveWarnings(
  html: string,
  context: DirectiveContext,
  directives: ReadonlyMap<string, Directive>,
): DirectiveWarning[] {
  const warnings: DirectiveWarning[] = [];

  for (const match of html.matchAll(DIRECTIVE_MARKER_RE)) {
    const name = match[1].toLowerCase();
    if (directives.has(name)) continue;

    warnings.push({
      code: 'unknown-directive',
      directive: name,
      slug: context.slug,
      message: `Unknown directive "${name}" in post "${context.slug}".`,
    });
  }

  return warnings;
}

async function transformCallouts(
  html: string,
  context: DirectiveContext,
  directives: ReadonlyMap<string, Directive>,
): Promise<DirectiveTransformResult> {
  let cursor = 0;
  let transformed = '';
  const meta: Record<string, DirectiveAttributes[]> = {};
  const warnings: DirectiveWarning[] = [];

  for (const match of html.matchAll(DIRECTIVE_PARAGRAPH_RE)) {
    const start = match.index;
    const directive = directives.get(match[1].toLowerCase());
    if (!directive || directive.kind === 'inline') continue;

    transformed += html.slice(cursor, start);
    let attributes: DirectiveAttributes;
    try {
      attributes = directive.parse(match[2]?.trim() ?? '');
    } catch (error) {
      if (!(error instanceof DirectiveAttributeError)) throw error;
      warnings.push({
        code: 'invalid-directive-attributes',
        directive: directive.name.toLowerCase(),
        slug: context.slug,
        message: `Invalid "${directive.name.toLowerCase()}" directive in post "${context.slug}": ${error.message}`,
      });
      cursor = start + match[0].length;
      continue;
    }
    if (directive.kind === 'block') {
      const output = resolveHtmlOutput(await directive.render(attributes, context));
      transformed += output.html;
      warnings.push(...output.warnings);
    } else {
      (meta[directive.name.toLowerCase()] ??= []).push(attributes);
    }
    cursor = start + match[0].length;
  }

  transformed += html.slice(cursor);

  return {
    html: transformed,
    meta,
    warnings,
  };
}
