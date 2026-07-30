import {
  AUTHORSHIP_ROLE_DEFINITIONS,
  isAuthorshipRole,
  type AuthorshipRole,
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

const AUTHORS_ATTRIBUTES = ['ai', 'role', 'from', 'to'] as const;
const LANGUAGE_ROLES: ReadonlySet<AuthorshipRole> = new Set(['translate', 'localize']);
const LANGUAGE_TAG_RE = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/iu;

export type AuthorshipValidationCode = 'unknown-role' | 'unsafe-not-by-ai-role';

export class AuthorshipValidationError extends Error {
  readonly name = 'AuthorshipValidationError';

  constructor(
    readonly code: AuthorshipValidationCode,
    readonly slug: string,
    readonly role: string,
  ) {
    const message = code === 'unknown-role'
      ? `Unknown authorship role "${role}" in post "${slug}".`
      : `Post "${slug}" uses #not-by-ai with unsafe authorship role "${role}".`;
    super(message);
  }
}

export interface AuthorshipCredit {
  ai: string;
  roles: readonly AuthorshipRole[];
  from?: string;
  to?: string;
}

export interface PostAuthorshipValidationInput {
  slug: string;
  hasNotByAi: boolean;
  meta: DirectiveTransformResult['meta'];
}

function parseRoles(value: string | undefined, slug: string): AuthorshipRole[] {
  if (!value?.trim()) {
    throw new DirectiveAttributeError('attribute "role" is required.');
  }

  const roles: AuthorshipRole[] = [];
  for (const rawRole of value.split(',')) {
    const role = rawRole.trim().toLowerCase();
    if (!role) {
      throw new DirectiveAttributeError('attribute "role" must be a comma-separated role list.');
    }
    if (!isAuthorshipRole(role)) {
      throw new AuthorshipValidationError('unknown-role', slug, role);
    }
    roles.push(role);
  }

  return roles;
}

function readCredit(attributes: DirectiveAttributes, slug: string): AuthorshipCredit {
  rejectUnsupportedAttributes(attributes, AUTHORS_ATTRIBUTES);

  const ai = attributes.ai?.trim();
  if (!ai) {
    throw new DirectiveAttributeError('attribute "ai" is required.');
  }

  const roles = parseRoles(attributes.role, slug);
  const usesLanguageDirection = roles.some((role) => LANGUAGE_ROLES.has(role));
  const from = attributes.from?.trim();
  const to = attributes.to?.trim();

  if (usesLanguageDirection && (!from || !to)) {
    throw new DirectiveAttributeError(
      'attributes "from" and "to" are required with translate or localize.',
    );
  }
  if (!usesLanguageDirection && (from !== undefined || to !== undefined)) {
    throw new DirectiveAttributeError(
      'attributes "from" and "to" require translate or localize.',
    );
  }
  if (from && !LANGUAGE_TAG_RE.test(from)) {
    throw new DirectiveAttributeError('attribute "from" must be a language tag.');
  }
  if (to && !LANGUAGE_TAG_RE.test(to)) {
    throw new DirectiveAttributeError('attribute "to" must be a language tag.');
  }

  return {
    ai,
    roles,
    ...(from && to ? { from, to } : {}),
  };
}

function parseAuthorsAttributes(
  rawAttributes: string,
  context: DirectiveContext,
): DirectiveAttributes {
  const credit = readCredit(parseKeyValueAttributes(rawAttributes), context.slug);
  return {
    ai: credit.ai,
    role: credit.roles.join(','),
    ...(credit.from && credit.to ? { from: credit.from, to: credit.to } : {}),
  };
}

export const authorsDirective = {
  name: 'authors',
  kind: 'meta',
  parse: parseAuthorsAttributes,
} satisfies MetaDirective;

export function readAuthorshipCredits(
  meta: DirectiveTransformResult['meta'],
  slug: string,
): AuthorshipCredit[] {
  return (meta.authors ?? []).map((attributes) => readCredit(attributes, slug));
}

export function validateAuthorshipPledge(
  slug: string,
  hasNotByAi: boolean,
  credits: readonly AuthorshipCredit[],
): void {
  if (!hasNotByAi) return;

  for (const credit of credits) {
    for (const role of credit.roles) {
      if (!AUTHORSHIP_ROLE_DEFINITIONS[role].pledgeSafe) {
        throw new AuthorshipValidationError('unsafe-not-by-ai-role', slug, role);
      }
    }
  }
}

export function validatePostAuthorship(
  input: PostAuthorshipValidationInput,
): AuthorshipCredit[] {
  const credits = readAuthorshipCredits(input.meta, input.slug);
  validateAuthorshipPledge(input.slug, input.hasNotByAi, credits);
  return credits;
}
