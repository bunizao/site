import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { parsePostLocaleTag } from '@bunizao/contracts/content';
import { blog } from '@/data/site';
import { getAccessiblePosts } from '@/features/posts/server/content';
import { getCanonicalSlug, getPostLocale, isTranslation } from '@/features/posts/i18n';
import type { I18nManifest } from '@/features/posts/server/i18n-manifest';

const distRoot = join(process.cwd(), 'dist/client');
const output = join(distRoot, '_i18n/posts.json');
const knownLocales = new Set(Object.keys(blog.copy));
const nonLocaleTags = new Set(['unlisted', 'no-toc', 'not-by-ai']);

function postLocaleTag(post: { tags: Array<{ name: string; visibility: string }> }) {
  const parsed = post.tags
    .filter((tag) => tag.visibility === 'internal')
    .map((tag) => parsePostLocaleTag(tag.name))
    .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  return parsed.find((tag) => knownLocales.has(tag.locale) || tag.canonicalSlug)
    ?? parsed.find((tag) => !nonLocaleTags.has(tag.locale))
    ?? null;
}

const posts = await getAccessiblePosts({ outputTarget: 'web' });
const bySlug = new Map(posts.map((post) => [post.slug, post]));
const manifest: I18nManifest = {};
const groups = new Map<string, typeof posts>();

for (const post of posts) {
  const parsed = postLocaleTag(post);
  if (parsed && !knownLocales.has(parsed.locale) && !nonLocaleTags.has(parsed.locale)) {
    throw new Error(`Unknown blog locale tag on ${post.slug}: ${parsed.locale}`);
  }
  const canonical = getCanonicalSlug(post);
  const group = groups.get(canonical);
  if (group) group.push(post);
  else groups.set(canonical, [post]);
}

for (const [canonical, group] of groups) {
  const canonicalPost = bySlug.get(canonical);
  if (!canonicalPost) {
    throw new Error(`Blog translation target does not exist: ${canonical}`);
  }

  const translations: Record<string, string> = {};
  const seenLocales = new Set<string>();
  for (const post of group) {
    const locale = getPostLocale(post);
    if (seenLocales.has(locale)) {
      throw new Error(`Duplicate ${locale} version in blog group ${canonical}`);
    }
    seenLocales.add(locale);
    if (!isTranslation(post)) continue;
    if (!knownLocales.has(locale)) {
      throw new Error(`Unknown blog translation locale on ${post.slug}: ${locale}`);
    }
    if (translations[locale]) {
      throw new Error(`Duplicate ${locale} translation in blog group ${canonical}`);
    }
    translations[locale] = post.slug;
  }

  if (Object.keys(translations).length > 0) {
    manifest[canonical] = { translations };
    for (const post of group) {
      if (!isTranslation(post)) continue;
      manifest[post.slug] = { canonical, locale: getPostLocale(post) };
    }
  }
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Generated i18n manifest for ${Object.keys(manifest).length} paths.`);
