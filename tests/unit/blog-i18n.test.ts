import { describe, expect, test } from 'bun:test';

import {
  findPostForRoute,
  getCanonicalSlug,
  getPostLocale,
  getPostVersions,
  isTranslation,
  mapOtherLanguages,
  parsePostRoute,
  postRouteSegment,
  postVersionPath,
  selectListedPosts,
  type PostVersion,
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

describe('postVersionPath', () => {
  test('keeps the original at its own slug whatever language it is in', () => {
    expect(postVersionPath(createPost('lun-chenmo', '论沉默'))).toBe('/blog/lun-chenmo');
    expect(postVersionPath(createPost('notes', 'Notes', ['#en']))).toBe('/blog/notes');
  });

  test('files a translation under its locale and the sibling slug, never its own', () => {
    expect(postVersionPath(createPost('on-silence', 'On Silence', ['#en:lun-chenmo'])))
      .toBe('/blog/en/lun-chenmo');
    expect(postRouteSegment(createPost('on-silence', 'On Silence', ['#en:lun-chenmo'])))
      .toBe('en/lun-chenmo');
  });
});

describe('parsePostRoute', () => {
  test('reads a bare slug as the original', () => {
    expect(parsePostRoute('lun-chenmo')).toEqual({ canonicalSlug: 'lun-chenmo', locale: null });
  });

  test('reads a published locale prefix as that translation', () => {
    expect(parsePostRoute('en/lun-chenmo')).toEqual({ canonicalSlug: 'lun-chenmo', locale: 'en' });
  });

  // The default locale owns the bare URL, so a prefixed form of it is not an
  // address; neither is a language we do not publish or a deeper path.
  test('rejects the default locale, unknown languages, and longer paths', () => {
    expect(parsePostRoute('zh/lun-chenmo')).toBeNull();
    expect(parsePostRoute('fr/lun-chenmo')).toBeNull();
    expect(parsePostRoute('en/lun-chenmo/extra')).toBeNull();
    expect(parsePostRoute('')).toBeNull();
  });
});

describe('findPostForRoute', () => {
  const zh = createPost('lun-chenmo', '论沉默');
  const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

  test('finds the original by slug and the translation by sibling and locale', () => {
    expect(findPostForRoute({ canonicalSlug: 'lun-chenmo', locale: null }, [zh, en])).toBe(zh);
    expect(findPostForRoute({ canonicalSlug: 'lun-chenmo', locale: 'en' }, [zh, en])).toBe(en);
  });

  test('does not answer a translation at its own Ghost slug', () => {
    expect(findPostForRoute({ canonicalSlug: 'on-silence', locale: 'en' }, [zh, en])).toBeNull();
    expect(findPostForRoute({ canonicalSlug: 'lun-chenmo', locale: 'en' }, [zh])).toBeNull();
  });
});

describe('getPostVersions', () => {
  const zh = createPost('lun-chenmo', '论沉默');
  const en = createPost('on-silence', 'On Silence', ['#en:lun-chenmo']);

  const zhVersion: PostVersion = {
    locale: 'zh',
    label: '中文',
    href: '/blog/lun-chenmo',
    current: true,
  };
  const enVersion: PostVersion = {
    locale: 'en',
    label: 'English',
    href: '/blog/en/lun-chenmo',
    current: false,
  };

  test('lists every version at its own URL, in a fixed locale order', () => {
    expect(getPostVersions(zh, [zh, en])).toEqual([zhVersion, enVersion]);
  });

  test('is the same list from the translation, with the current flag moved', () => {
    expect(getPostVersions(en, [zh, en])).toEqual([
      { ...zhVersion, current: false },
      { ...enVersion, current: true },
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
