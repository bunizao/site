export type AuthorshipRoleFamily =
  | 'prose'
  | 'language'
  | 'structure'
  | 'inquiry'
  | 'assets';

export interface AuthorshipRoleDefinition {
  family: AuthorshipRoleFamily;
  meaning: string;
  pledgeSafe: boolean;
}

export const AUTHORSHIP_ROLE_DEFINITIONS = Object.freeze({
  draft: {
    family: 'prose',
    meaning: 'produced the first draft',
    pledgeSafe: false,
  },
  cowrite: {
    family: 'prose',
    meaning: 'human and model wrote interleaved',
    pledgeSafe: false,
  },
  rewrite: {
    family: 'prose',
    meaning: 'rewrote human prose',
    pledgeSafe: false,
  },
  expand: {
    family: 'prose',
    meaning: 'expanded human notes into prose',
    pledgeSafe: false,
  },
  condense: {
    family: 'prose',
    meaning: 'cut human prose down',
    pledgeSafe: false,
  },
  translate: {
    family: 'language',
    meaning: 'rendered into another language',
    pledgeSafe: false,
  },
  localize: {
    family: 'language',
    meaning: 'adapted beyond literal translation',
    pledgeSafe: false,
  },
  polish: {
    family: 'language',
    meaning: 'reworded for flow or tone',
    pledgeSafe: false,
  },
  proofread: {
    family: 'language',
    meaning: 'typos, grammar, punctuation only',
    pledgeSafe: true,
  },
  outline: {
    family: 'structure',
    meaning: 'proposed structure, no prose shipped',
    pledgeSafe: true,
  },
  restructure: {
    family: 'structure',
    meaning: 'reordered existing sections',
    pledgeSafe: true,
  },
  title: {
    family: 'structure',
    meaning: 'headline or subhead',
    pledgeSafe: false,
  },
  summarize: {
    family: 'structure',
    meaning: 'excerpt, TL;DR, meta description',
    pledgeSafe: false,
  },
  research: {
    family: 'inquiry',
    meaning: 'gathered sources',
    pledgeSafe: true,
  },
  factcheck: {
    family: 'inquiry',
    meaning: 'verified claims',
    pledgeSafe: true,
  },
  review: {
    family: 'inquiry',
    meaning: 'critique or feedback, nothing landed verbatim',
    pledgeSafe: true,
  },
  code: {
    family: 'assets',
    meaning: 'code samples in the post',
    pledgeSafe: true,
  },
  illustrate: {
    family: 'assets',
    meaning: 'generated imagery',
    pledgeSafe: true,
  },
  diagram: {
    family: 'assets',
    meaning: 'charts or figures',
    pledgeSafe: true,
  },
  data: {
    family: 'assets',
    meaning: 'processed or analysed data',
    pledgeSafe: true,
  },
  transcribe: {
    family: 'assets',
    meaning: 'audio to text of human speech',
    pledgeSafe: true,
  },
  alt: {
    family: 'assets',
    meaning: 'image alt text',
    pledgeSafe: true,
  },
} as const satisfies Readonly<Record<string, AuthorshipRoleDefinition>>);

export type AuthorshipRole = keyof typeof AUTHORSHIP_ROLE_DEFINITIONS;

export function isAuthorshipRole(value: string): value is AuthorshipRole {
  return Object.hasOwn(AUTHORSHIP_ROLE_DEFINITIONS, value);
}
