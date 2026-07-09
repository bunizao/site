// CV / resume document shared between `site` (public) and `site-api` (private).
// `site` is canonical; after editing, run `bun run sync:contracts` in site-api.
//
// The redaction model is deliberately small: any leaf the owner wants hidden
// from anonymous visitors is a `Redactable`. The public read strips the value
// server-side (in site-api) via `redactCvDocument` before the payload ever
// crosses the service binding — never mask on the client. The threat model is
// crawlers and search indexing, so a redacted leaf carries no value at all.

export type CvLang = 'en' | 'zh';

export interface Localized {
  en: string;
  zh: string;
}

/** A field the owner may hide from anonymous visitors. */
export interface Redactable {
  value: Localized;
  /** true → the public read strips `value`, leaving only `{ redacted: true }`. */
  redacted?: boolean;
}

/** Public shape of a `Redactable`: either the value survives, or it is gone. */
export type PublicRedactable =
  | { value: Localized; redacted?: false }
  | { redacted: true };

export interface CvLink {
  label: Localized;
  url: string;
}

export interface CvWorkItem {
  company: Redactable;
  role: Localized;
  location?: Redactable;
  start: string; // 'YYYY-MM'
  end?: string; // absent = present
  summary: Localized;
  highlights: Localized[];
  tags?: string[];
}

export interface CvEducationItem {
  school: Redactable;
  degree: Localized;
  start: string; // 'YYYY-MM' or 'YYYY'
  end?: string;
  note?: Localized;
}

export interface CvProjectItem {
  name: Localized;
  url?: string;
  description: Localized;
  tags?: string[];
}

export interface CvSkillGroup {
  group: Localized;
  items: string[];
}

export interface CvIdentity {
  displayName: Localized; // public handle / English name
  legalName: Redactable; // real Chinese name — redacted
  headline: Localized;
  location: Redactable; // public = city-level; redacted variant = precise
  email: Redactable;
  phone: Redactable; // redacted
  links: CvLink[];
}

export interface CvDocument {
  updatedAt: string; // ISO date, shown on page + PDF footer
  identity: CvIdentity;
  summary: Localized;
  work: CvWorkItem[];
  education: CvEducationItem[];
  projects: CvProjectItem[];
  skills: CvSkillGroup[];
}

// Public projection: every `Redactable` leaf becomes `PublicRedactable`.
// The rest of the shape is identical, so downstream code renders one type.

export interface CvPublicIdentity {
  displayName: Localized;
  legalName: PublicRedactable;
  headline: Localized;
  location: PublicRedactable;
  email: PublicRedactable;
  phone: PublicRedactable;
  links: CvLink[];
}

export interface CvPublicWorkItem extends Omit<CvWorkItem, 'company' | 'location'> {
  company: PublicRedactable;
  location?: PublicRedactable;
}

export interface CvPublicEducationItem extends Omit<CvEducationItem, 'school'> {
  school: PublicRedactable;
}

export interface CvPublicDocument extends Omit<CvDocument, 'identity' | 'work' | 'education'> {
  identity: CvPublicIdentity;
  work: CvPublicWorkItem[];
  education: CvPublicEducationItem[];
}

export interface CvPdfCacheEntry {
  lang: CvLang;
  key: string;
  cached: boolean;
}

export interface CvPdfCacheStatus {
  available: boolean;
  keys: CvPdfCacheEntry[];
}

/** Strip one leaf: hidden fields lose their value entirely. */
function redactLeaf(field: Redactable): PublicRedactable {
  return field.redacted ? { redacted: true } : { value: field.value };
}

/** Strip an optional leaf, preserving absence. */
function redactOptionalLeaf(field: Redactable | undefined): PublicRedactable | undefined {
  return field ? redactLeaf(field) : undefined;
}

/**
 * Produce the anonymous-safe projection of a CV. This is the only place the
 * stripping logic lives, so both repos and the dev fixture share it.
 */
export function redactCvDocument(doc: CvDocument): CvPublicDocument {
  return {
    ...doc,
    identity: {
      displayName: doc.identity.displayName,
      legalName: redactLeaf(doc.identity.legalName),
      headline: doc.identity.headline,
      location: redactLeaf(doc.identity.location),
      email: redactLeaf(doc.identity.email),
      phone: redactLeaf(doc.identity.phone),
      links: doc.identity.links,
    },
    work: doc.work.map((item) => ({
      ...item,
      company: redactLeaf(item.company),
      location: redactOptionalLeaf(item.location),
    })),
    education: doc.education.map((item) => ({
      ...item,
      school: redactLeaf(item.school),
    })),
  };
}

/** Narrow a public leaf to its surviving value, or null when redacted. */
export function cvValue(field: PublicRedactable | undefined): Localized | null {
  if (!field || 'redacted' in field && field.redacted) return null;
  return 'value' in field ? field.value : null;
}
