import { parsePostLocaleTag } from '@bunizao/contracts/content';
import { blog, type BlogLocale } from '@/data/site';
import { postPath } from './format';
import type { Post } from './types';

// Ghost has no native i18n and no custom fields on the Content API, so language
// lives in an internal tag — the same channel as #unlisted and #no-toc.
//
//   #<locale>              this post is written in <locale>
//   #<locale>:<canonical>  this post is the <locale> version of <canonical>
//
// <canonical> is the default-locale post's slug, which is also the article's one
// public URL. The Chinese original therefore carries no tag at all: publishing a
// translation is one tag on one post, so "tagged the translation, forgot the
// original" is not a state that can exist.
//
// The grammar is parsed from `tag.name`, never `tag.slug` — Ghost slugifies the
// colon away, and once it is gone `#zh-tw:notes` and `#zh:tw-notes` collapse to
// the same string. The parser is shared with site-api through
// @bunizao/contracts so both repos agree on what a translation is.

const KNOWN_LOCALES = Object.keys(blog.copy) as BlogLocale[];

function isKnownLocale(locale: string): locale is BlogLocale {
  return (KNOWN_LOCALES as string[]).includes(locale);
}

// `#unlisted` and `#no-toc` are valid BCP 47 shapes, so the grammar alone cannot
// tell a language tag from the site's other internal conventions. A colon can:
// only a translation tag has one. A bare tag is a language tag only when it
// names a language we actually publish.
function readLocaleTag(post: Pick<Post, 'tags'>) {
  for (const tag of post.tags) {
    if (tag.visibility !== 'internal') continue;

    const parsed = parsePostLocaleTag(tag.name);
    if (!parsed) continue;
    if (parsed.canonicalSlug || isKnownLocale(parsed.locale)) return parsed;
  }

  return null;
}

/** Language the post is written in. Unmarked posts are the default locale. */
export function getPostLocale(post: Pick<Post, 'tags'>): BlogLocale {
  const locale = readLocaleTag(post)?.locale;

  return locale && isKnownLocale(locale) ? locale : blog.locale.default;
}

/**
 * Slug of the article this post belongs to — its own unless it is a translation.
 * This is the group key and the one public URL, which are deliberately the same
 * thing: an article that cannot be addressed cannot be a group.
 */
export function getCanonicalSlug(post: Pick<Post, 'slug' | 'tags'>): string {
  return readLocaleTag(post)?.canonicalSlug ?? post.slug;
}

/** True when this post is a version of some other post. */
export function isTranslation(post: Pick<Post, 'tags'>): boolean {
  return readLocaleTag(post)?.canonicalSlug !== undefined;
}

/** Public URL of the `locale` version of the article at `canonicalSlug`. */
export function translationPath(locale: BlogLocale, canonicalSlug: string): string {
  return `/blog/${locale}/${canonicalSlug}`;
}

/**
 * The one URL this post is served and indexed at. The original owns the bare
 * slug whatever language it is written in; a translation lives under its
 * locale, so every version is a URL of its own and a crawler never has to ask
 * for a language.
 */
export function postVersionPath(post: Pick<Post, 'slug' | 'tags'>): string {
  const tag = readLocaleTag(post);

  return tag?.canonicalSlug
    ? translationPath(tag.locale as BlogLocale, tag.canonicalSlug)
    : postPath(post.slug);
}

/** The `[...slug]` route segment `postVersionPath` answers at. */
export function postRouteSegment(post: Pick<Post, 'slug' | 'tags'>): string {
  return postVersionPath(post).slice('/blog/'.length);
}

export interface PostRoute {
  canonicalSlug: string;
  /** Null when the route addresses the original rather than a translation. */
  locale: BlogLocale | null;
}

/**
 * Read a `/blog/...` rest segment back into the version it addresses:
 * `lun-chenmo` is the original, `en/lun-chenmo` its English translation.
 * Anything else is not an article URL.
 */
export function parsePostRoute(segment: string): PostRoute | null {
  const parts = segment.split('/').filter(Boolean);

  if (parts.length === 1) return { canonicalSlug: parts[0], locale: null };
  if (parts.length === 2 && isKnownLocale(parts[0]) && parts[0] !== blog.locale.default) {
    return { canonicalSlug: parts[1], locale: parts[0] };
  }

  return null;
}

/** The post a route addresses, or null when no such version is published. */
export function findPostForRoute(route: PostRoute, posts: Post[]): Post | null {
  if (route.locale === null) {
    return posts.find((post) => post.slug === route.canonicalSlug) ?? null;
  }

  return posts.find(
    (post) =>
      isTranslation(post)
      && getCanonicalSlug(post) === route.canonicalSlug
      && getPostLocale(post) === route.locale,
  ) ?? null;
}

/**
 * One row per article: translations are dropped, everything else passes through.
 *
 * A post written in English first carries the bare `#en` form and is its own
 * canonical, so it stays listed — the rule reads the whole grammar rather than
 * assuming the default locale is the original.
 *
 * `posts` arrives newest-first and already excludes #unlisted; order is kept.
 */
export function selectListedPosts(posts: Post[]): Post[] {
  return posts.filter((post) => !isTranslation(post));
}

export interface PostVersion {
  locale: BlogLocale;
  /** Endonym — the name the language calls itself. Never a flag, never a code. */
  label: string;
  /**
   * Where this version lives. It is at once the switcher target, the hreflang
   * target and the version's own canonical, because an hreflang target that
   * declares a different canonical is a target Google drops — and with it the
   * whole cluster.
   */
  href: string;
  current: boolean;
}

// Fixed locale order, not "current first": a menu that reshuffles between posts
// makes the reader re-read it every time. Empty when there is nothing to switch
// to, so a control that appears is always a control that works.
export function getPostVersions(post: Post, posts: Post[]): PostVersion[] {
  const canonical = getCanonicalSlug(post);
  const group = [
    post,
    ...posts.filter(
      (candidate) => candidate.slug !== post.slug && getCanonicalSlug(candidate) === canonical,
    ),
  ];

  if (group.length < 2) {
    return [];
  }

  const byLocale = new Map(group.map((member) => [getPostLocale(member), member]));

  return KNOWN_LOCALES.filter((locale) => byLocale.has(locale)).map((locale) => {
    const version = byLocale.get(locale)!;

    return {
      locale,
      label: blog.copy[locale].languageSwitcher.language,
      href: postVersionPath(version),
      current: version.slug === post.slug,
    };
  });
}

// Endonyms of the *other* languages each post exists in, keyed by slug. Built
// once per listing page: a row cannot tell it has siblings from its own tags,
// because the tag runs translation -> canonical and not back.
export function mapOtherLanguages(posts: Post[]): Map<string, string[]> {
  const groups = new Map<string, Post[]>();

  for (const post of posts) {
    const canonical = getCanonicalSlug(post);
    const group = groups.get(canonical);

    if (group) group.push(post);
    else groups.set(canonical, [post]);
  }

  const byPost = new Map<string, string[]>();

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    const present = new Set(group.map(getPostLocale));

    for (const post of group) {
      const here = getPostLocale(post);
      const others = KNOWN_LOCALES.filter(
        (locale) => locale !== here && present.has(locale),
      );

      if (others.length > 0) {
        byPost.set(
          post.slug,
          others.map((locale) => blog.copy[locale].languageSwitcher.language),
        );
      }
    }
  }

  return byPost;
}
