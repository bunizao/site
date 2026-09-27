import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { getAccessiblePosts } from '@/features/posts/server/content';
import { createManifest } from '@/features/posts/server/i18n-manifest';

// Slugs and tags only: no rich-content render (and no embed metadata fetches).
const output = join(process.cwd(), 'dist/client/_i18n/posts.json');
const posts = await getAccessiblePosts();
const manifest = createManifest(posts, { strict: true });

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Generated i18n manifest for ${Object.keys(manifest).length} paths.`);
