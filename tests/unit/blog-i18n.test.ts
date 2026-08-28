import { describe, expect, test } from 'bun:test';

import {
  getCanonicalSlug,
  getPostLocale,
  getPostVersions,
  getTranslations,
  isTranslation,
  mapOtherLanguages,
  selectListedPosts,
  selectRequestedVersion,
} from '@/features/posts/i18n';
import type { Post } from '@/features/posts/types';

// Tags arrive the way Ghost returns them: the author's string verbatim in
// `name`, a slugified copy in `slug` with the colon dropped. Building both here
// is the point — a helper that reads `slug` passes on `#en` and silently
// mis-groups every `#<locale>:<canonical>` tag.
function ghostSlugify(name: string): string {
  return `hash-${name.slice(1).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function createPost(slug: string, title: string, tagNames: string[] = []): Post {
  return {
    slug,
    title,
    tags: tagNames.map((name) => ({
      name,
      slug: name.startsWith('#') ? ghostSlugify(name) : name,
      visibility: name.startsWith('#') ? 'internal' : 'public',
    })),
  } as unknown as Post;
}

describe('getPostLocale', () => {
  test('falls back to the publication default when no tag is present', () => {
    expect(getPostLocale(createPost('lun-chenmo', '论沉默'))).toBe('zh');
  });

  test('reads a bare locale tag', () => {
    expect(getPostLocale(createPost('on-silence', 'On Silence', ['#en']))).toBe('en');
  });

  test('reads the locale of a translation tag', () => {
    const post = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

    expect(getPostLocale(post)).toBe('en');
  });

  test('falls back for a language the publication has no copy for', () => {
    const post = createPost('le-silence', 'Le Silence', ['#fr:lun-chenmo']);

    expect(getPostLocale(post)).toBe('zh');
  });

  test('does not mistake the other internal conventions for languages', () => {
    const post = createPost('night-boat', '夜航船', ['#unlisted', '#no-toc', '#not-by-ai']);

    expect(getPostLocale(post)).toBe('zh');
  });

  test('ignores a public tag that mimics the grammar', () => {
    expect(getPostLocale(createPost('decoy', 'Decoy', ['en']))).toBe('zh');
  });
});

describe('getCanonicalSlug', () => {
  test('is the post itself when it carries no tag', () => {
    expect(getCanonicalSlug(createPost('lun-chenmo', '论沉默'))).toBe('lun-chenmo');
  });

  test('is the post itself for an original written in another language', () => {
    expect(getCanonicalSlug(createPost('on-silence', 'On Silence', ['#en']))).toBe('on-silence');
  });

  test('is the tag target for a translation', () => {
    const post = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

    expect(getCanonicalSlug(post)).toBe('lun-chenmo');
  });

  test('reads the tag name, not the slug Ghost derived from it', () => {
    const post = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

    expect(post.tags[0]?.slug).toBe('hash-en-lun-chenmo');
    expect(getCanonicalSlug(post)).toBe('lun-chenmo');
  });
});

describe('isTranslation', () => {
  test.each([
    ['#en:lun-chenmo', true],
    ['#en', false],
    ['#unlisted', false],
  ] as const)('%s -> %s', (tagName, expected) => {
    expect(isTranslation(createPost('post', 'Post', [tagName]))).toBe(expected);
  });

  test('is false for an untagged post', () => {
    expect(isTranslation(createPost('post', 'Post'))).toBe(false);
  });
});

describe('getTranslations', () => {
  const zh = createPost('lun-chenmo', '论沉默');
  const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);
  const unrelated = createPost('night-boat', '夜航船');

  test('finds the translation from the canonical post', () => {
    expect(getTranslations(zh, [zh, en, unrelated])).toEqual([
      { locale: 'en', slug: 'on-silence', title: 'On Silence' },
    ]);
  });

  test('finds the canonical post from the translation', () => {
    expect(getTranslations(en, [zh, en, unrelated])).toEqual([
      { locale: 'zh', slug: 'lun-chenmo', title: '论沉默' },
    ]);
  });

  test('is empty for a post outside any group', () => {
    expect(getTranslations(unrelated, [zh, en, unrelated])).toEqual([]);
  });
});

describe('getPostVersions', () => {
  const zh = createPost('lun-chenmo', '论沉默');
  const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

  test('lists every version at the one canonical URL', () => {
    expect(getPostVersions(zh, [zh, en])).toEqual([
      { locale: 'zh', label: '中文', href: '/blog/lun-chenmo/?lang=zh', current: true },
      { locale: 'en', label: 'English', href: '/blog/lun-chenmo/?lang=en', current: false },
    ]);
  });

  test('points the translation at the canonical URL too, and marks it current', () => {
    expect(getPostVersions(en, [zh, en])).toEqual([
      { locale: 'zh', label: '中文', href: '/blog/lun-chenmo/?lang=zh', current: false },
      { locale: 'en', label: 'English', href: '/blog/lun-chenmo/?lang=en', current: true },
    ]);
  });

  test('is empty when there is nothing to switch to', () => {
    expect(getPostVersions(zh, [zh])).toEqual([]);
  });
});

describe('selectListedPosts', () => {
  test('drops the translation and keeps the canonical post', () => {
    const zh = createPost('lun-chenmo', '论沉默');
    const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

    expect(selectListedPosts([en, zh]).map((post) => post.slug)).toEqual(['lun-chenmo']);
  });

  test('keeps an original written in another language', () => {
    const en = createPost('on-silence', 'On Silence', ['#en']);

    expect(selectListedPosts([en]).map((post) => post.slug)).toEqual(['on-silence']);
  });

  test('passes everything else through in its original order', () => {
    const posts = [
      createPost('night-boat', '夜航船'),
      createPost('lun-chenmo', '论沉默'),
      createPost('on-silence', 'On Silence', ['#en:lun-chenmo']),
      createPost('lantern', '灯'),
    ];

    expect(selectListedPosts(posts).map((post) => post.slug)).toEqual([
      'night-boat',
      'lun-chenmo',
      'lantern',
    ]);
  });
});

describe('mapOtherLanguages', () => {
  const zh = createPost('lun-chenmo', '论沉默');
  const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);
  const unrelated = createPost('night-boat', '夜航船');

  test('names the other language on both members of a group', () => {
    const map = mapOtherLanguages([zh, en, unrelated]);

    expect(map.get('lun-chenmo')).toEqual(['English']);
    expect(map.get('on-silence')).toEqual(['中文']);
  });

  test('leaves untranslated posts out entirely', () => {
    expect(mapOtherLanguages([zh, en, unrelated]).has('night-boat')).toBe(false);
  });
});

describe('selectRequestedVersion', () => {
  const zh = createPost('lun-chenmo', '论沉默');
  const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);
  const posts = [zh, en];

  test('serves the requested language at the canonical URL', () => {
    expect(selectRequestedVersion(zh, posts, 'en')).toBe(en);
  });

  test('serves the canonical post back from the translation', () => {
    expect(selectRequestedVersion(en, posts, 'zh')).toBe(zh);
  });

  test('keeps the post when it already is the language asked for', () => {
    expect(selectRequestedVersion(zh, posts, 'zh')).toBe(zh);
  });

  test('keeps the post when nothing was asked for', () => {
    expect(selectRequestedVersion(zh, posts, null)).toBe(zh);
  });

  test('keeps the post when the language is not one we publish', () => {
    expect(selectRequestedVersion(zh, posts, 'fr')).toBe(zh);
  });

  // A language we do not have is still a language the reader should be able to
  // read the article in, so the group falls back rather than 404ing.
  test('keeps the post when the group has no such version', () => {
    expect(selectRequestedVersion(zh, [zh], 'en')).toBe(zh);
  });
});
