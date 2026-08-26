import { blog, type BlogLocale } from '@/data/site';
import type { Post } from './types';

// Ghost has no native i18n, so language lives in internal tags — the same
// convention as #unlisted / #no-toc. A post without a #lang-* tag is written in
// the publication's default locale, which keeps every existing post untouched.
//
//   #lang-en      this post is English
//   #tr-<key>     translation group; sibling versions share one key
//
// Slugs stay idiomatic per language (/blog/lun-chenmo/ and /blog/on-silence/)
// rather than following a `-en` suffix rule: Ghost recomputes the slug when the
// title changes, and a suffix convention would break the pairing silently.
const LANG_TAG_PREFIX = 'hash-lang-';
const TRANSLATION_TAG_PREFIX = 'hash-tr-';

export interface PostTranslation {
  locale: BlogLocale;
  slug: string;
  title: string;
}

const KNOWN_LOCALES = Object.keys(blog.copy) as BlogLocale[];

function readInternalTagSuffix(
  post: Pick<Post, 'tags'>,
  prefix: string,
): string | null {
  const tag = post.tags.find(
    (candidate) =>
      candidate.visibility === 'internal' && candidate.slug.startsWith(prefix),
  );

  const suffix = tag?.slug.slice(prefix.length).trim();

  return suffix ? suffix : null;
}

/** Language the post is written in. Unmarked posts are the default locale. */
export function getPostLocale(post: Pick<Post, 'tags'>): BlogLocale {
  const suffix = readInternalTagSuffix(post, LANG_TAG_PREFIX);
  const locale = KNOWN_LOCALES.find((candidate) => candidate === suffix);

  return locale ?? blog.locale.default;
}

/** Translation group key, or null when the post has no sibling versions. */
export function getTranslationKey(post: Pick<Post, 'tags'>): string | null {
  return readInternalTagSuffix(post, TRANSLATION_TAG_PREFIX);
}

// Linear scan per post. At a personal blog's scale that is cheaper than the
// index it would replace, and it stays obvious at 2am. Pass the *accessible*
// posts, not the listed ones — a translation is deliberately absent from the
// listing but must still be linkable from its sibling.
export function getTranslations(post: Post, posts: Post[]): PostTranslation[] {
  const key = getTranslationKey(post);

  if (!key) {
    return [];
  }

  return posts
    .filter(
      (candidate) =>
        candidate.slug !== post.slug && getTranslationKey(candidate) === key,
    )
    .map((candidate) => ({
      locale: getPostLocale(candidate),
      slug: candidate.slug,
      title: candidate.title,
    }));
}

// One row per translation group: the default-locale version when it exists,
// otherwise the group's only version. Posts outside any group pass through.
//
// The narrower rule — keep only default-locale posts — reads the same today and
// costs one line, but it silently drops a post written in English first. This
// rule gives the same listing (translations never show up twice, the feed stays
// Chinese) without that hole.
//
// `posts` arrives newest-first and already excludes #unlisted; order is kept.
export function selectListedPosts(posts: Post[]): Post[] {
  const preferred = new Map<string, Post>();

  for (const post of posts) {
    const key = getTranslationKey(post);
    if (!key) continue;

    const held = preferred.get(key);
    const isDefaultLocale = getPostLocale(post) === blog.locale.default;

    if (!held || (isDefaultLocale && getPostLocale(held) !== blog.locale.default)) {
      preferred.set(key, post);
    }
  }

  return posts.filter((post) => {
    const key = getTranslationKey(post);
    return !key || preferred.get(key) === post;
  });
}
