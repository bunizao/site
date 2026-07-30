import { load } from 'cheerio';

import { canonical } from '@/lib/seo';

import type {
  DirectiveContext,
  DirectiveHtmlResult,
  DirectiveWarning,
  InlineDirective,
} from './types';

const DEFINITION_RE = /^\s*\[\^([^\]\r\n]+)\]:\s*([\s\S]*?)\s*$/u;
const REFERENCE_RE = /\[\^([^\]\r\n]+)\]/gu;
const TEXT_TARGETS = new Set<DirectiveContext['outputTarget']>(['excerpt', 'og']);
const ABSOLUTE_LINK_TARGETS = new Set<DirectiveContext['outputTarget']>([
  'rss',
  'agent-markdown',
]);

interface SourceLocation {
  startOffset: number;
  endOffset: number;
  startTag?: SourceLocation;
  endTag?: SourceLocation;
}

interface LocatedNode {
  type: string;
  data?: string;
  children?: LocatedNode[];
  sourceCodeLocation?: SourceLocation;
}

interface SourceReplacement {
  start: number;
  end: number;
  value: string;
}

interface FootnoteDefinition {
  bodyHtml: string;
  bodyText: string;
  order: number;
}

interface FootnoteReference {
  label: string;
  start: number;
  end: number;
}

function warning(
  code: string,
  context: DirectiveContext,
  message: string,
): DirectiveWarning {
  return {
    code,
    directive: 'footnotes',
    slug: context.slug,
    message,
  };
}

function plainText(html: string): string {
  const $ = load(html, {}, false);
  return $.root().text().replace(/\s+/gu, ' ').trim();
}

function applyReplacements(html: string, replacements: readonly SourceReplacement[]): string {
  let output = html;
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    output = output.slice(0, replacement.start) + replacement.value + output.slice(replacement.end);
  }
  return output;
}

function collectDefinitions(
  html: string,
  context: DirectiveContext,
): {
  html: string;
  definitions: Map<string, FootnoteDefinition>;
  warnings: DirectiveWarning[];
} {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const definitions = new Map<string, FootnoteDefinition>();
  const replacements: SourceReplacement[] = [];
  const warnings: DirectiveWarning[] = [];
  const splitContinuationOffsets = new Set<number>();
  let order = 0;

  $('p').each((_, element) => {
    const location = (element as unknown as LocatedNode).sourceCodeLocation;
    if (!location?.startTag || !location.endTag) return;

    const innerHtml = html.slice(location.startTag.endOffset, location.endTag.startOffset);
    const match = innerHtml.match(DEFINITION_RE);
    if (!match) return;

    const label = match[1].trim();
    if (!label) return;

    const bodyHtml = match[2].trim();
    const isSplitContinuation = splitContinuationOffsets.has(location.startOffset);
    if (!definitions.has(label)) {
      definitions.set(label, {
        bodyHtml,
        bodyText: plainText(bodyHtml),
        order,
      });
      order += 1;
    } else if (!isSplitContinuation) {
      warnings.push(warning(
        'duplicate-definition',
        context,
        `Duplicate footnote definition "${label}" in post "${context.slug}".`,
      ));
    }

    const nextParagraph = $(element).next();
    if (nextParagraph.is('p')) {
      const nextLocation = (nextParagraph[0] as unknown as LocatedNode).sourceCodeLocation;
      if (nextLocation?.startTag && nextLocation.endTag) {
        const nextInnerHtml = html.slice(
          nextLocation.startTag.endOffset,
          nextLocation.endTag.startOffset,
        );
        const nextMatch = nextInnerHtml.match(DEFINITION_RE);
        if (nextMatch?.[1].trim() === label) {
          splitContinuationOffsets.add(nextLocation.startOffset);
          if (!isSplitContinuation) {
            warnings.push(warning(
              'split-definition',
              context,
              `Footnote definition "${label}" in post "${context.slug}" repeats in an adjacent paragraph; only the first definition body is used.`,
            ));
          }
        }
      }
    }

    replacements.push({
      start: location.startOffset,
      end: location.endOffset,
      value: '',
    });
  });

  return {
    html: applyReplacements(html, replacements),
    definitions,
    warnings,
  };
}

function collectReferences(html: string): FootnoteReference[] {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const root = $.root()[0] as unknown as LocatedNode;
  const references: FootnoteReference[] = [];

  const visit = (node: LocatedNode): void => {
    if (node.type === 'text' && node.sourceCodeLocation) {
      const source = html.slice(
        node.sourceCodeLocation.startOffset,
        node.sourceCodeLocation.endOffset,
      );
      for (const match of source.matchAll(REFERENCE_RE)) {
        const label = match[1].trim();
        if (!label) continue;
        const start = node.sourceCodeLocation.startOffset + match.index;
        references.push({ label, start, end: start + match[0].length });
      }
    }

    for (const child of node.children ?? []) visit(child);
  };

  visit(root);
  return references.sort((left, right) => left.start - right.start);
}

function repeatSuffix(occurrence: number): string {
  if (occurrence === 1) return '';
  if (occurrence <= 26) return String.fromCharCode(96 + occurrence);
  return `-${occurrence}`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function absoluteFragmentUrl(context: DirectiveContext, fragment: string): string {
  const encodedSlug = context.slug.split('/').map(encodeURIComponent).join('/');
  const url = new URL(canonical(`/blog/${encodedSlug}/`));
  url.hash = fragment;
  return url.toString();
}

function fragmentHref(
  context: DirectiveContext,
  fragment: string,
): string {
  return ABSOLUTE_LINK_TARGETS.has(context.outputTarget)
    ? absoluteFragmentUrl(context, fragment)
    : `#${fragment}`;
}

function transformFootnotes(
  html: string,
  context: DirectiveContext,
): DirectiveHtmlResult {
  if (!html.includes('[^')) return { html, warnings: [] };

  const collected = collectDefinitions(html, context);
  const references = collectReferences(collected.html);
  const warnings = [...collected.warnings];
  const numberByLabel = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const warnedOrphans = new Set<string>();
  const replacements: SourceReplacement[] = [];

  for (const reference of references) {
    const number = numberByLabel.get(reference.label) ?? numberByLabel.size + 1;
    numberByLabel.set(reference.label, number);
    const occurrence = (occurrences.get(reference.label) ?? 0) + 1;
    occurrences.set(reference.label, occurrence);
    const definition = collected.definitions.get(reference.label);

    let value: string;
    if (TEXT_TARGETS.has(context.outputTarget)) {
      value = definition?.bodyText ? ` (${definition.bodyText})` : ` [${number}]`;
    } else {
      const referenceId = `fnref-${number}${repeatSuffix(occurrence)}`;
      const marker = definition
        ? `<a href="${escapeAttribute(fragmentHref(context, `fn-${number}`))}">${number}</a>`
        : String(number);
      value = `<sup class="blog-fn-ref" id="${referenceId}">${marker}</sup>`;
    }

    replacements.push({ start: reference.start, end: reference.end, value });

    if (!definition && !warnedOrphans.has(reference.label)) {
      warnedOrphans.add(reference.label);
      warnings.push(warning(
        'orphan-reference',
        context,
        `Missing footnote definition "${reference.label}" in post "${context.slug}".`,
      ));
    }
  }

  const orderedDefinitionLabels = [...collected.definitions.entries()]
    .sort((left, right) => left[1].order - right[1].order)
    .map(([label]) => label);
  for (const label of orderedDefinitionLabels) {
    if (numberByLabel.has(label)) continue;
    warnings.push(warning(
      'orphan-definition',
      context,
      `Unused footnote definition "${label}" in post "${context.slug}".`,
    ));
  }

  let transformed = applyReplacements(collected.html, replacements);
  if (TEXT_TARGETS.has(context.outputTarget)) {
    return { html: transformed, warnings };
  }

  const items = [...numberByLabel.entries()]
    .sort((left, right) => left[1] - right[1])
    .flatMap(([label, number]) => {
      const definition = collected.definitions.get(label);
      if (!definition) return [];
      const backlink = escapeAttribute(fragmentHref(context, `fnref-${number}`));
      return [
        `<li id="fn-${number}">${definition.bodyHtml}`
        + `${definition.bodyHtml ? ' ' : ''}`
        + `<a class="blog-fn-back" href="${backlink}">↩</a></li>`,
      ];
    });

  if (items.length > 0) {
    transformed += `<section class="blog-footnotes"><ol>${items.join('')}</ol></section>`;
  }

  return { html: transformed, warnings };
}

export const footnotesDirective: InlineDirective = {
  name: 'footnotes',
  kind: 'inline',
  transform: transformFootnotes,
};
