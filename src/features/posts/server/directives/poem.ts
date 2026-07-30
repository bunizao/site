import { load } from 'cheerio';

import type {
  DirectiveContext,
  DirectiveHtmlResult,
  DirectiveWarning,
  InlineDirective,
} from './types';

const MARKER_RE = /^\s*(?:<(?:em|strong|b|i|p)>\s*)?\[!poem\]\s*([^<\n]*)/iu;
const MARKER_DETECTION_RE = /^\s*(?:<\w+>\s*)?\[!poem\]/iu;
const ATTRIBUTION_RE = /[—–]\s*[^—–\n]{1,40}\s*$/u;
const ATTRIBUTION_ONLY_RE = /^(?:[—–]|--|-)\s*\S.{0,40}$/u;
const INLINE_ATTRIBUTION_RE = /^([\s\S]*?)\s*((?:[—–]|--)\s*[^—–<]{1,40})\s*$/u;
const MASKED_PRE_RE = /\u{e000}blog-directive-\d+-pre-\d+\u{e001}/u;

interface SourceRange {
  start: number;
  end: number;
  replacement: string;
}

interface ParsedPoem {
  title: string;
  center: boolean;
  plain: boolean;
  stanzas: string[];
  attribution: string;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/gu, '').replace(/\s+/gu, ' ').trim();
}

function parsePoem(rawHtml: string): ParsedPoem | null {
  const marker = rawHtml.match(MARKER_RE);

  let center = false;
  let plain = false;
  const title = marker
    ? marker[1]
      .replace(/\[(center|plain)\]/giu, (_full, modifier: string) => {
        if (modifier.toLowerCase() === 'center') center = true;
        else plain = true;
        return '';
      })
      .replace(/\s+/gu, ' ')
      .trim()
    : '';
  const body = marker
    ? rawHtml
      .slice(marker[0].length)
      .replace(/^\s*(?:<\/(?:em|strong|b|i|p)>)?\s*(?:<br\s*\/?>\s*)?/iu, '')
    : rawHtml;
  let stanzas: string[];
  if (/<p[\s>]/iu.test(body)) {
    const $body = load(body, {}, false);
    stanzas = $body('p')
      .toArray()
      .map((paragraph) => $body(paragraph).html()?.trim() ?? '')
      .filter(Boolean);
  } else {
    stanzas = body
      .split(/(?:<br\s*\/?>\s*){2,}/iu)
      .map((stanza) => stanza
        .replace(/^(?:\s*<br\s*\/?>)+|(?:<br\s*\/?>\s*)+$/giu, '')
        .trim())
      .filter(Boolean);
  }

  if (stanzas.length === 0) return null;

  let attribution = '';
  const last = stanzas.at(-1) ?? '';
  if (ATTRIBUTION_ONLY_RE.test(stripTags(last)) && stanzas.length > 1) {
    attribution = stanzas.pop() ?? '';
  } else {
    const split = last.match(INLINE_ATTRIBUTION_RE);
    if (split) {
      stanzas[stanzas.length - 1] = split[1].trim();
      attribution = split[2].trim();
    }
  }

  return { title, center, plain, stanzas, attribution };
}

function addClasses(startTag: string, classNames: readonly string[]): string {
  const classAttribute = /\bclass\s*=\s*(['"])(.*?)\1/iu;
  const match = startTag.match(classAttribute);
  if (match) {
    const existing = match[2].split(/\s+/u).filter(Boolean);
    const classes = [...existing, ...classNames.filter((name) => !existing.includes(name))];
    return startTag.replace(classAttribute, `class=${match[1]}${classes.join(' ')}${match[1]}`);
  }

  return startTag.replace(/>$/u, ` class="${classNames.join(' ')}">`);
}

function renderPoem(
  startTag: string,
  poem: ParsedPoem,
  outputTarget: DirectiveContext['outputTarget'],
): string {
  const richOutput = outputTarget === 'web'
    || outputTarget === 'preview'
    || outputTarget === 'rss';
  const classes = [
    'blog-poem',
    ...(poem.center ? ['blog-poem--center'] : []),
    ...(poem.plain ? ['blog-poem--plain'] : []),
  ];
  const parts: string[] = [];
  if (poem.title) {
    parts.push(richOutput
      ? `<p class="blog-poem__title">${poem.title}</p>`
      : `<p>${poem.title}</p>`);
  }
  for (const stanza of poem.stanzas) parts.push(`<p>${stanza}</p>`);
  if (poem.attribution) {
    parts.push(richOutput
      ? `<cite class="blog-poem__attribution">${poem.attribution}</cite>`
      : `<cite>${poem.attribution}</cite>`);
  }

  const openingTag = richOutput ? addClasses(startTag, classes) : startTag;
  return `${openingTag}${parts.join('')}</blockquote>`;
}

function transformPoems(
  html: string,
  context: DirectiveContext,
): DirectiveHtmlResult {
  if (!/<blockquote\b/iu.test(html)) return { html, warnings: [] };

  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const replacements: SourceRange[] = [];
  const warnings: DirectiveWarning[] = [];

  $('blockquote').each((_, element) => {
    const location = element.sourceCodeLocation;
    if (!location?.startTag || !location.endTag) return;
    if ($(element).hasClass('blog-poem')) return;
    const innerHtml = html.slice(location.startTag.endOffset, location.endTag.startOffset);
    const text = $(element).text().replace(/\s+/gu, ' ').trim();
    if (!text) return;
    const hasMarker = MARKER_DETECTION_RE.test(innerHtml);
    const hasAttribution = ATTRIBUTION_RE.test(text);
    const hasHandBrokenVerse = (innerHtml.match(/<br\s*\/?>/giu) ?? []).length >= 2
      && !/<\/(?:ul|ol|h[1-6]|pre)>/iu.test(innerHtml)
      && !MASKED_PRE_RE.test(innerHtml);
    if (!hasMarker && !hasAttribution && !hasHandBrokenVerse) return;
    const poem = parsePoem(innerHtml);
    if (!poem) {
      if (hasMarker) {
        warnings.push({
          code: 'invalid-directive-content',
          directive: 'poem',
          slug: context.slug,
          message: `Invalid "poem" directive in post "${context.slug}": poem body is empty.`,
        });
      }
      return;
    }
    const startTag = html.slice(location.startTag.startOffset, location.startTag.endOffset);
    replacements.push({
      start: location.startOffset,
      end: location.endOffset,
      replacement: renderPoem(startTag, poem, context.outputTarget),
    });
  });

  let transformed = html;
  for (const range of replacements.sort((left, right) => right.start - left.start)) {
    transformed = transformed.slice(0, range.start) + range.replacement + transformed.slice(range.end);
  }

  return { html: transformed, warnings };
}

export const poemDirective: InlineDirective = {
  name: 'poem',
  kind: 'inline',
  transform: transformPoems,
};
