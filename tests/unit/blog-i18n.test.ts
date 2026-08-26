import { describe, expect, test } from 'bun:test';

import {
  getPostLocale,
  getTranslationKey,
  getTranslations,
  selectListedPosts,
} from '@/features/posts/i18n';
import type { Post } from '@/features/posts/types';

// The i18n helpers read slug, title, and tags only; the rest of Post is noise.
function createPost(slug: string, title: string, tagSlugs: string[] = []): Post {
  return {
    slug,
    title,
    tags: tagSlugs.map((tagSlug) => ({
      slug: tagSlug,
      name: tagSlug.startsWith('hash-') ? `#${tagSlug.slice('hash-'.length)}` : tagSlug,
      visibility: tagSlug.startsWith('hash-') ? 'internal' : 'public',
    })),
  } as unknown as Post;
}

describe('getPostLocale', () => {
  test('falls back to the publication default when no language tag is present', () => {
    expect(getPostLocale(createPost('lun-chenmo', '论沉默'))).toBe('zh');
  });

  test('reads the language from the #lang- tag', () => {
    expect(getPostLocale(createPost('on-silence', 'On Silence', ['hash-lang-en']))).toBe('en');
  });

  test('ignores a language the publication has no copy for', () => {
    expect(getPostLocale(createPost('le-silence', 'Le Silence', ['hash-lang-fr']))).toBe('zh');
  });

  test('ignores a public tag that mimics the internal prefix', () => {
    const post = createPost('decoy', 'Decoy', ['lang-en']);

    expect(getPostLocale(post)).toBe('zh');
  });
});

describe('getTranslationKey', () => {
  test('is null for a post with no sibling versions', () => {
    expect(getTranslationKey(createPost('night-boat', '夜航船'))).toBeNull();
  });

  test('reads the group key from the #tr- tag', () => {
    const post = createPost('on-silence', 'On Silence', ['hash-lang-en', 'hash-tr-silence']);

    expect(getTranslationKey(post)).toBe('silence');
  });
});

describe('getTranslations', () => {
  const zh = createPost('lun-chenmo', '论沉默', ['hash-tr-silence']);
  const en = createPost('on-silence', 'On Silence', ['hash-lang-en', 'hash-tr-silence']);
  const unrelated = createPost('night-boat', '夜航船');

  test('returns the sibling versions without the post itself', () => {
    expect(getTranslations(zh, [zh, en, unrelated])).toEqual([
      { locale: 'en', slug: 'on-silence', title: 'On Silence' },
    ]);
  });

  test('is empty for a post outside any translation group', () => {
    expect(getTranslations(unrelated, [zh, en, unrelated])).toEqual([]);
  });
});

describe('selectListedPosts', () => {
  test('keeps the default-locale version of a translated post', () => {
    const zh = createPost('lun-chenmo', '论沉默', ['hash-tr-silence']);
    const en = createPost('on-silence', 'On Silence', ['hash-lang-en', 'hash-tr-silence']);

    expect(selectListedPosts([en, zh]).map((post) => post.slug)).toEqual(['lun-chenmo']);
  });

  test('keeps a group that has no default-locale version', () => {
    const en = createPost('on-silence', 'On Silence', ['hash-lang-en', 'hash-tr-silence']);

    expect(selectListedPosts([en]).map((post) => post.slug)).toEqual(['on-silence']);
  });

  test('passes untagged posts through in their original order', () => {
    const posts = [
      createPost('night-boat', '夜航船'),
      createPost('lun-chenmo', '论沉默', ['hash-tr-silence']),
      createPost('on-silence', 'On Silence', ['hash-lang-en', 'hash-tr-silence']),
      createPost('lantern', '灯'),
    ];

    expect(selectListedPosts(posts).map((post) => post.slug)).toEqual([
      'night-boat',
      'lun-chenmo',
      'lantern',
    ]);
  });
});
