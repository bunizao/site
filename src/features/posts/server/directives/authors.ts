import {
  MODEL_REGISTRY_SOURCE,
  resolveAuthorshipModel,
  type ResolvedModel,
} from '@/data/authorship';

import {
  DirectiveAttributeError,
  parseKeyValueAttributes,
  rejectUnsupportedAttributes,
} from './attributes';
import type {
  DirectiveAttributes,
  DirectiveContext,
  DirectiveTransformResult,
  MetaDirective,
} from './types';

const AUTHORS_ATTRIBUTES = ['ai', 'note'] as const;

// A note is one clause completing "<model> ___" — long enough to say what the
// model did, short enough to stay on the footer's two lines.
const NOTE_MAX_LENGTH = 160;

export type AuthorshipValidationCode = 'unknown-model';

export class AuthorshipValidationError extends Error {
  readonly name = 'AuthorshipValidationError';

  constructor(
    readonly code: AuthorshipValidationCode,
    readonly slug: string,
    readonly model: string,
  ) {
    super(
      `Unknown authorship model "${model}" in post "${slug}". `
        + `Expected "provider/model" from ${MODEL_REGISTRY_SOURCE}; `
        + 'run `bun run sync:models` if the model is newer than the snapshot.',
    );
  }
}

export interface AuthorshipCredit {
  model: ResolvedModel;
  /** Hand-written predicate. Absent means the generic "written with" line. */
  note?: string;
}

export interface PostAuthorshipValidationInput {
  slug: string;
  meta: DirectiveTransformResult['meta'];
}

function readCredit(attributes: DirectiveAttributes, slug: string): AuthorshipCredit {
  rejectUnsupportedAttributes(attributes, AUTHORS_ATTRIBUTES);

  const ai = attributes.ai?.trim();
  if (!ai) {
    throw new DirectiveAttributeError('attribute "ai" is required.');
  }
  const model = resolveAuthorshipModel(ai);
  if (!model) {
    // Not a DirectiveAttributeError: a typo'd model reference must stop the
    // build, not degrade to a warning and drop the credit off the post.
    throw new AuthorshipValidationError('unknown-model', slug, ai);
  }

  const note = attributes.note?.trim();
  if (note !== undefined && !note) {
    throw new DirectiveAttributeError('attribute "note" must not be empty.');
  }
  if (note && note.length > NOTE_MAX_LENGTH) {
    throw new DirectiveAttributeError(
      `attribute "note" must be at most ${NOTE_MAX_LENGTH} characters.`,
    );
  }

  return { model, ...(note ? { note } : {}) };
}

function parseAuthorsAttributes(
  rawAttributes: string,
  context: DirectiveContext,
): DirectiveAttributes {
  const credit = readCredit(parseKeyValueAttributes(rawAttributes), context.slug);
  return { ai: credit.model.id, ...(credit.note ? { note: credit.note } : {}) };
}

export const authorsDirective = {
  name: 'authors',
  kind: 'meta',
  parse: parseAuthorsAttributes,
} satisfies MetaDirective;

/**
 * Credits in directive order, one entry per model. Repeated `ai` values collapse
 * into the first entry so a model is never named twice in the footer; their
 * notes join with a comma in the order they were written.
 */
export function readAuthorshipCredits(
  meta: DirectiveTransformResult['meta'],
  slug: string,
): AuthorshipCredit[] {
  const byModel = new Map<string, AuthorshipCredit>();

  for (const attributes of meta.authors ?? []) {
    const credit = readCredit(attributes, slug);
    const seen = byModel.get(credit.model.id);
    if (!seen) {
      byModel.set(credit.model.id, credit);
      continue;
    }
    if (credit.note) {
      seen.note = seen.note ? `${seen.note}, ${credit.note}` : credit.note;
    }
  }

  return [...byModel.values()];
}

export function validatePostAuthorship(
  input: PostAuthorshipValidationInput,
): AuthorshipCredit[] {
  return readAuthorshipCredits(input.meta, input.slug);
}
