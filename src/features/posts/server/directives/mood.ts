import { canonical } from '@/lib/seo';

import { enrichMoodEmbeds } from '../mood-embed';
import {
  DirectiveAttributeError,
  parseKeyValueAttributes,
  rejectUnsupportedAttributes,
} from './attributes';
import type {
  BlockDirective,
  DirectiveAttributes,
  DirectiveOutputTarget,
} from './types';

const MOOD_ATTRIBUTES = ['id', 'theme', 'density'] as const;
const RICH_TARGETS: ReadonlySet<DirectiveOutputTarget> = new Set(['web', 'preview']);

function parseMoodAttributes(rawAttributes: string): DirectiveAttributes {
  const attributes = parseKeyValueAttributes(rawAttributes);
  rejectUnsupportedAttributes(attributes, MOOD_ATTRIBUTES);

  if (!/^[1-9]\d*$/u.test(attributes.id ?? '')) {
    throw new DirectiveAttributeError('attribute "id" must be a positive integer.');
  }
  if (attributes.theme && !/^(?:auto|light|dark)$/u.test(attributes.theme)) {
    throw new DirectiveAttributeError('attribute "theme" must be auto, light, or dark.');
  }
  if (attributes.density && !/^(?:regular|compact)$/u.test(attributes.density)) {
    throw new DirectiveAttributeError('attribute "density" must be regular or compact.');
  }

  return attributes;
}

function renderMoodDirective(
  attributes: DirectiveAttributes,
  outputTarget: DirectiveOutputTarget,
): string {
  const id = attributes.id;
  if (!RICH_TARGETS.has(outputTarget)) {
    return `<p><a href="${canonical(`/mood/${id}`)}">View mood post ${id}</a></p>`;
  }

  const options = [
    attributes.theme ? `theme=${attributes.theme}` : '',
    attributes.density ? `density=${attributes.density}` : '',
  ].filter(Boolean);
  const suffix = options.length > 0 ? ` ${options.join(' ')}` : '';
  return enrichMoodEmbeds(`<p>[mood:${id}${suffix}]</p>`);
}

export const moodDirective: BlockDirective = {
  name: 'mood',
  kind: 'block',
  parse: parseMoodAttributes,
  render: (attributes, context) => renderMoodDirective(attributes, context.outputTarget),
};
