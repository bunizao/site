import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { meta } from '@/data/site';
import { builtBlogMarkdownAssetPath } from '@/features/agent-markdown/server/built-blog';
import {
  buildPostAgentMarkdown,
  buildPostListAgentMarkdown,
  buildTagArchiveAgentMarkdown,
  buildTagDirectoryAgentMarkdown,
} from '@/features/posts/server/agent-markdown';
import {
  getAccessiblePosts,
  getListedPosts,
  getPublicTagDirectory,
  getTagArchive,
} from '@/features/posts/server/content';
import { getCanonicalSlug, getPostLocale, isTranslation } from '@/features/posts/i18n';
import { isUnlistedVersion } from '@/features/posts/unlisted';

const distRoot = join(process.cwd(), 'dist/client');
const blogRoot = join(distRoot, '_agent-markdown/blog');
const siteUrl = new URL(meta.siteUrl);

function outputPath(assetPath: string): string {
  return join(distRoot, assetPath.replace(/^\/+/, ''));
}

async function writeMarkdown(assetPath: string, body: string): Promise<void> {
  const path = outputPath(assetPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, 'utf8');
}

const [posts, accessiblePosts, tags] = await Promise.all([
  getListedPosts({ outputTarget: 'agent-markdown' }),
  getAccessiblePosts({ outputTarget: 'agent-markdown' }),
  getPublicTagDirectory(),
]);
// Translations are off every listing but have a page, so they get its Markdown.
// Unlisted versions (originals and their translations) have a page too; they
// go under a separate prefix the Worker serves with noindex robots directives.
// The Worker never falls back to Ghost at runtime, so every accessible version
// needs its asset here.
const translations = accessiblePosts.filter(
  (post) => isTranslation(post) && !isUnlistedVersion(post, accessiblePosts),
);
const unlistedVersions = accessiblePosts.filter((post) => isUnlistedVersion(post, accessiblePosts));

await rm(blogRoot, { recursive: true, force: true });

await writeMarkdown(
  builtBlogMarkdownAssetPath({ kind: 'index' }),
  buildPostListAgentMarkdown('Blog', posts, siteUrl),
);
await writeMarkdown(
  builtBlogMarkdownAssetPath({ kind: 'tags' }),
  buildTagDirectoryAgentMarkdown(tags, siteUrl),
);

await Promise.all([
  ...posts.map((post) =>
    writeMarkdown(
      builtBlogMarkdownAssetPath({ kind: 'post', slug: post.slug }),
      buildPostAgentMarkdown(post, siteUrl),
    ),
  ),
  ...translations.map((post) =>
    writeMarkdown(
      builtBlogMarkdownAssetPath({
        kind: 'post',
        slug: getCanonicalSlug(post),
        locale: getPostLocale(post),
      }),
      buildPostAgentMarkdown(post, siteUrl),
    ),
  ),
  ...unlistedVersions.map((post) =>
    writeMarkdown(
      builtBlogMarkdownAssetPath({
        kind: 'post',
        slug: getCanonicalSlug(post),
        locale: isTranslation(post) ? getPostLocale(post) : undefined,
        unlisted: true,
      }),
      buildPostAgentMarkdown(post, siteUrl),
    ),
  ),
]);

await Promise.all(tags.map(async (tag) => {
  const archive = await getTagArchive(tag.slug);
  if (!archive) return;

  await writeMarkdown(
    builtBlogMarkdownAssetPath({ kind: 'tag', slug: tag.slug }),
    buildTagArchiveAgentMarkdown(archive.tag, archive.archive.posts, siteUrl),
  );
}));

console.log(`Generated agent Markdown for ${posts.length} blog posts, ${translations.length} translations, ${unlistedVersions.length} unlisted versions and ${tags.length} tags.`);
