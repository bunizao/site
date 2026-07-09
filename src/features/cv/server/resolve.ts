import {
  cvValue,
  type CvDocument,
  type CvPublicDocument,
  type Localized,
  type PublicRedactable,
  type Redactable,
} from '@bunizao/contracts';

// One resolved shape the UI renders regardless of source. A redactable leaf
// becomes either its `Localized` value or `null` (hidden). The full document
// keeps every value; the public document surfaces only the survivors, so the
// UI just checks for `null` and draws a redaction chip. It never sees the
// difference between "value stripped server-side" and "field absent".

export type CvLeaf = Localized | null;

export interface ResolvedIdentity {
  displayName: Localized;
  legalName: CvLeaf;
  headline: Localized;
  location: CvLeaf;
  email: CvLeaf;
  phone: CvLeaf;
  links: CvDocument['identity']['links'];
}

export interface ResolvedWorkItem {
  company: CvLeaf;
  role: Localized;
  location: CvLeaf;
  start: string;
  end?: string;
  summary: Localized;
  highlights: Localized[];
  tags?: string[];
}

export interface ResolvedEducationItem {
  school: CvLeaf;
  degree: Localized;
  start: string;
  end?: string;
  note?: Localized;
}

export interface ResolvedCv {
  full: boolean;
  updatedAt: string;
  identity: ResolvedIdentity;
  summary: Localized;
  work: ResolvedWorkItem[];
  projects: CvDocument['projects'];
  education: ResolvedEducationItem[];
  skills: CvDocument['skills'];
}

/** Full doc: every redactable leaf resolves to its value. */
function fullLeaf(field: Redactable | undefined): CvLeaf {
  return field ? field.value : null;
}

/** Public doc: surviving value, else null. */
function publicLeaf(field: PublicRedactable | undefined): CvLeaf {
  return cvValue(field);
}

export function resolveFullCv(doc: CvDocument): ResolvedCv {
  return {
    full: true,
    updatedAt: doc.updatedAt,
    identity: {
      displayName: doc.identity.displayName,
      legalName: fullLeaf(doc.identity.legalName),
      headline: doc.identity.headline,
      location: fullLeaf(doc.identity.location),
      email: fullLeaf(doc.identity.email),
      phone: fullLeaf(doc.identity.phone),
      links: doc.identity.links,
    },
    summary: doc.summary,
    work: doc.work.map((item) => ({
      company: fullLeaf(item.company),
      role: item.role,
      location: fullLeaf(item.location),
      start: item.start,
      end: item.end,
      summary: item.summary,
      highlights: item.highlights,
      tags: item.tags,
    })),
    projects: doc.projects,
    education: doc.education.map((item) => ({
      school: fullLeaf(item.school),
      degree: item.degree,
      start: item.start,
      end: item.end,
      note: item.note,
    })),
    skills: doc.skills,
  };
}

export function resolvePublicCv(doc: CvPublicDocument): ResolvedCv {
  return {
    full: false,
    updatedAt: doc.updatedAt,
    identity: {
      displayName: doc.identity.displayName,
      legalName: publicLeaf(doc.identity.legalName),
      headline: doc.identity.headline,
      location: publicLeaf(doc.identity.location),
      email: publicLeaf(doc.identity.email),
      phone: publicLeaf(doc.identity.phone),
      links: doc.identity.links,
    },
    summary: doc.summary,
    work: doc.work.map((item) => ({
      company: publicLeaf(item.company),
      role: item.role,
      location: publicLeaf(item.location),
      start: item.start,
      end: item.end,
      summary: item.summary,
      highlights: item.highlights,
      tags: item.tags,
    })),
    projects: doc.projects,
    education: doc.education.map((item) => ({
      school: publicLeaf(item.school),
      degree: item.degree,
      start: item.start,
      end: item.end,
      note: item.note,
    })),
    skills: doc.skills,
  };
}
