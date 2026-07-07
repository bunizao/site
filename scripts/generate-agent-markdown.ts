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
  getAllPosts,
  getPublicTagDirectory,
  getTagArchive,
} from '@/features/posts/server/content';

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

const [posts, tags] = await Promise.all([
  getAllPosts(),
  getPublicTagDirectory(),
]);

await rm(blogRoot, { recursive: true, force: true });

await writeMarkdown(
  builtBlogMarkdownAssetPath({ kind: 'index' }),
  buildPostListAgentMarkdown('Blog', posts, siteUrl),
);
await writeMarkdown(
  builtBlogMarkdownAssetPath({ kind: 'tags' }),
  buildTagDirectoryAgentMarkdown(tags, siteUrl),
);

await Promise.all(posts.map((post) =>
  writeMarkdown(
    builtBlogMarkdownAssetPath({ kind: 'post', slug: post.slug }),
    buildPostAgentMarkdown(post, siteUrl),
  ),
));

await Promise.all(tags.map(async (tag) => {
  const archive = await getTagArchive(tag.slug);
  if (!archive) return;

  await writeMarkdown(
    builtBlogMarkdownAssetPath({ kind: 'tag', slug: tag.slug }),
    buildTagArchiveAgentMarkdown(archive.tag, archive.archive.posts, siteUrl),
  );
}));

console.log(`Generated agent Markdown for ${posts.length} blog posts and ${tags.length} tags.`);
