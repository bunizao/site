import {
  DirectiveAttributeError,
  parseKeyValueAttributes,
  rejectUnsupportedAttributes,
} from './attributes';
import type { DirectiveAttributes, MetaDirective } from './types';

const TITLE_ATTRIBUTES = ['en'] as const;

/**
 * `[!title en="The Tide Writes Back"]` — the post's title in another language,
 * written by the author for posts that have no full translation. Ghost has no
 * custom fields, so it rides in the body like `[!authors]`.
 */
export function parseTitleAttributes(rawAttributes: string): DirectiveAttributes {
  const attributes = parseKeyValueAttributes(rawAttributes);
  rejectUnsupportedAttributes(attributes, TITLE_ATTRIBUTES);

  const en = attributes.en?.trim();
  if (!en) {
    throw new DirectiveAttributeError('attribute "en" is required.');
  }

  return { en };
}

export const titleDirective = {
  name: 'title',
  kind: 'meta',
  parse: parseTitleAttributes,
} satisfies MetaDirective;
