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

export interface PostTranslation {
  locale: BlogLocale;
  slug: string;
  title: string;
}

const KNOWN_LOCALES = Object.keys(blog.copy) as BlogLocale[];
export { resolveRequestLocale, type RequestLocaleOptions } from '@/features/agent-markdown/server/negotiation';

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

// Linear scan per post. At a personal blog's scale that is cheaper than the
// index it would replace, and it stays obvious at 2am. Pass the *accessible*
// posts, not the listed ones — a translation is deliberately absent from the
// listing but must still be linkable from its sibling.
export function getTranslations(post: Post, posts: Post[]): PostTranslation[] {
  const canonical = getCanonicalSlug(post);

  return posts
    .filter(
      (candidate) =>
        candidate.slug !== post.slug && getCanonicalSlug(candidate) === canonical,
    )
    .map((candidate) => ({
      locale: getPostLocale(candidate),
      slug: candidate.slug,
      title: candidate.title,
    }));
}

/**
 * The version of this article the request asked for, or the post itself when it
 * asked for nothing we publish.
 *
 * `?lang=` names a language, not a slug: the article is the group, and every
 * member of it answers at the canonical URL. Falling back to `post` rather than
 * 404ing is deliberate — a language we do not have is a language the reader
 * should still be able to read the article in.
 */
export function selectRequestedVersion(
  post: Post,
  posts: Post[],
  requested: string | null,
): Post {
  const normalizedRequested = requested?.trim().toLowerCase() ?? '';
  if (!normalizedRequested || !isKnownLocale(normalizedRequested)) return post;
  if (getPostLocale(post) === normalizedRequested) return post;

  const canonical = getCanonicalSlug(post);

  return (
    posts.find(
      (candidate) =>
        getCanonicalSlug(candidate) === canonical && getPostLocale(candidate) === normalizedRequested,
    ) ?? post
  );
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
   * Where the switcher sends the reader. Always explicit, including for the
   * default locale: picking 中文 has to be recorded as a choice, or a reader
   * whose browser asks for English lands back in English on the next post.
   */
  href: string;
  /**
   * The URL this version is indexed under. The default locale owns the bare
   * canonical; every other language owns its `?lang=` URL. They have to differ
   * from `href` — an hreflang target that declares a different canonical is a
   * target Google drops, which is the whole cluster gone.
   */
  indexedHref: string;
  current: boolean;
}

// Fixed locale order, not "current first": a menu that reshuffles between posts
// makes the reader re-read it every time. Empty when there is nothing to switch
// to, so a control that appears is always a control that works.
export function getPostVersions(post: Post, posts: Post[]): PostVersion[] {
  const translations = getTranslations(post, posts);

  if (translations.length === 0) {
    return [];
  }

  const here = getPostLocale(post);
  const canonical = postPath(getCanonicalSlug(post));
  const present = new Set<BlogLocale>([
    here,
    ...translations.map((translation) => translation.locale),
  ]);

  return KNOWN_LOCALES.filter((locale) => present.has(locale)).map((locale) => ({
    locale,
    label: blog.copy[locale].languageSwitcher.language,
    // Absolute rather than a bare `?lang=`: a translation's own build path is
    // reachable until the edge redirect runs, and a relative query there would
    // ask for a language at a URL that does not serve languages.
    href: `${canonical}?lang=${locale}`,
    indexedHref: locale === blog.locale.default ? canonical : `${canonical}?lang=${locale}`,
    current: locale === here,
  }));
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
