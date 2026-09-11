import { canonical } from '@/lib/seo';

import { enrichMoodEmbeds } from '../mood-embed';
import {
  DirectiveAttributeError,
  parseKeyValueAttributes,
  rejectUnsupportedAttributes,
} from './attributes';
import { isRichDirectiveOutputTarget } from './types';
import type {
  BlockDirective,
  DirectiveAttributes,
  DirectiveOutputTarget,
} from './types';

export const MOOD_ATTRIBUTES = ['id', 'theme', 'density'] as const;
export const MOOD_ID_RE = /^[1-9]\d*$/u;
export const MOOD_THEMES = ['auto', 'light', 'dark'] as const;
export const MOOD_DENSITIES = ['regular', 'compact'] as const;

function parseMoodAttributes(rawAttributes: string): DirectiveAttributes {
  const attributes = parseKeyValueAttributes(rawAttributes);
  rejectUnsupportedAttributes(attributes, MOOD_ATTRIBUTES);

  if (!MOOD_ID_RE.test(attributes.id ?? '')) {
    throw new DirectiveAttributeError('attribute "id" must be a positive integer.');
  }
  if (attributes.theme && !MOOD_THEMES.includes(attributes.theme as (typeof MOOD_THEMES)[number])) {
    throw new DirectiveAttributeError('attribute "theme" must be auto, light, or dark.');
  }
  if (
    attributes.density
    && !MOOD_DENSITIES.includes(attributes.density as (typeof MOOD_DENSITIES)[number])
  ) {
    throw new DirectiveAttributeError('attribute "density" must be regular or compact.');
  }

  return attributes;
}

function renderMoodDirective(
  attributes: DirectiveAttributes,
  outputTarget: DirectiveOutputTarget,
): string {
  const id = attributes.id;
  if (!isRichDirectiveOutputTarget(outputTarget)) {
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
