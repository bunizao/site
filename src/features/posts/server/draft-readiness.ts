import { getCanonicalSlug, getPostLocale, isTranslation } from '@/features/posts/i18n';
import { isUnlistedPost } from '@/features/posts/unlisted';
import type { Tag } from '@/features/posts/types';

import type { GhostAdminPostTag } from './ghost-admin';

// Not covered by i18n.ts or unlisted.ts — those two parse a grammar
// (`#<locale>[:<canonical>]`) and a single marker respectively; these two are
// each one flat tag, checked the same way src/pages/blog/[...slug].astro
// already checks #no-toc.
const NO_TOC_TAG_SLUG = 'hash-no-toc';
const NOT_BY_AI_TAG_SLUG = 'hash-not-by-ai';

export interface DraftTranslationReadiness {
  locale: string;
  canonical: string;
  canonicalExists: boolean;
}

export interface DraftReadiness {
  translation: DraftTranslationReadiness | null;
  unlisted: boolean;
  noToc: boolean;
  notByAi: boolean;
  tags: string[];
}

// i18n.ts and unlisted.ts read the full site `Tag`, but the Admin client only
// requests name/slug/visibility (see ghost-admin.ts's `include=tags`) —
// nothing else about a tag affects the grammar those modules parse, so the
// remaining fields are filled with values no rendering path reads.
function toSiteTag(tag: GhostAdminPostTag): Tag {
  return {
    id: tag.slug,
    slug: tag.slug,
    name: tag.name,
    url: '',
    description: null,
    featureImage: null,
    accentColor: null,
    visibility: tag.visibility,
    codeInjectionHead: null,
    postCount: 0,
  };
}

/**
 * The pane header data: what the site will do with this post, read the same
 * way the published site reads it — through i18n.ts's translation grammar
 * and unlisted.ts's marker, never by reparsing tag names here.
 *
 * `resolveKnownSlugs` is only called (and so only ever fetches Ghost) when
 * the post actually carries a translation tag; every other draft renders
 * without the extra round trip.
 */
export async function computeDraftReadiness(
  adminTags: readonly GhostAdminPostTag[],
  slug: string,
  resolveKnownSlugs: () => Promise<ReadonlySet<string>>,
): Promise<DraftReadiness> {
  const tags = adminTags.map(toSiteTag);
  const post = { slug, tags };

  const translation = isTranslation(post)
    ? {
      locale: getPostLocale(post),
      canonical: getCanonicalSlug(post),
      canonicalExists: (await resolveKnownSlugs()).has(getCanonicalSlug(post)),
    }
    : null;

  return {
    translation,
    unlisted: isUnlistedPost(post),
    noToc: tags.some((tag) => tag.slug === NO_TOC_TAG_SLUG),
    notByAi: tags.some((tag) => tag.slug === NOT_BY_AI_TAG_SLUG),
    tags: tags.map((tag) => tag.name),
  };
}
