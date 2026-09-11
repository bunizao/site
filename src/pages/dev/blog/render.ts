import type { APIRoute } from 'astro';

import { blog } from '@/data/site';
import { jsonBadRequest, jsonError, jsonOk } from '@/lib/http/json-response';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES,
  isGhostAdminPostId,
  type GhostAdminClient,
} from '@/features/posts/server/ghost-admin';
import {
  createConfiguredGhostAdminClient,
  mapGhostPreviewError,
  type GhostDraftPreviewFailure,
} from '@/features/posts/server/ghost-preview';
import {
  readAuthorshipCredits,
  type AuthorshipCredit,
} from '@/features/posts/server/directives/authors';
import type { DirectiveWarning } from '@/features/posts/server/directives/types';
import { renderPostContent } from '@/features/posts/server/rich-content';

// Owner auth is enforced by src/middleware.ts for every /dev/* path — this
// route needs no auth check of its own, same as /dev/blog/[id].astro.
export const prerender = false;

const NO_STORE_PREVIEW_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

// Keystrokes hit this endpoint every ~300ms (see draft-live-channel.ts), so
// the slug/title lookup for a given post id is cached for the life of the
// Worker instance. Capped so a long session cannot grow this without bound.
interface CachedPostMeta {
  slug: string;
  title: string;
}

const POST_META_CACHE_LIMIT = 50;
const postMetaCache = new Map<string, CachedPostMeta>();

function cachePostMeta(id: string, meta: CachedPostMeta): void {
  postMetaCache.delete(id);
  postMetaCache.set(id, meta);
  if (postMetaCache.size > POST_META_CACHE_LIMIT) {
    const oldest = postMetaCache.keys().next().value;
    if (oldest !== undefined) postMetaCache.delete(oldest);
  }
}

export interface ResolveDraftRenderOptions {
  id: string;
  html: string;
  locals?: RuntimeEnvLocals;
  createClient?: () => GhostAdminClient;
}

export type ResolveDraftRenderResult =
  | {
      ok: true;
      html: string;
      warnings: DirectiveWarning[];
      authorshipCredits: readonly AuthorshipCredit[];
    }
  | GhostDraftPreviewFailure
  | { ok: false; status: 400 | 413; message: string };

/**
 * The pure core of the render endpoint: id + edited html in, rendered
 * fragment + warnings out. Split out from the Astro route so unit tests can
 * call it directly with an injected Admin client, the way
 * resolveGhostDraftPreview is tested.
 */
export async function resolveDraftRender(
  options: ResolveDraftRenderOptions,
): Promise<ResolveDraftRenderResult> {
  if (!isGhostAdminPostId(options.id)) {
    return { ok: false, status: 400, message: 'Invalid Ghost Admin post ID.' };
  }

  const htmlBytes = new TextEncoder().encode(options.html).length;
  if (htmlBytes > DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES) {
    return { ok: false, status: 413, message: 'Draft HTML exceeds the preview size limit.' };
  }

  try {
    let meta = postMetaCache.get(options.id);
    if (!meta) {
      const client = options.createClient?.() ?? createConfiguredGhostAdminClient(options.locals);
      const post = await client.readPostById(options.id);
      meta = { slug: post.slug, title: post.title };
      cachePostMeta(options.id, meta);
    }

    const transformed = await renderPostContent(options.html, {
      slug: meta.slug,
      locale: blog.locale.blog,
      outputTarget: 'preview',
    });

    return {
      ok: true,
      html: transformed.html,
      warnings: transformed.warnings,
      authorshipCredits: readAuthorshipCredits(transformed.meta, meta.slug),
    };
  } catch (error) {
    return mapGhostPreviewError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonBadRequest('Invalid JSON body.', NO_STORE_PREVIEW_HEADERS);
  }

  if (!isRecord(body) || typeof body.id !== 'string' || typeof body.html !== 'string') {
    return jsonBadRequest('Request must include "id" and "html".', NO_STORE_PREVIEW_HEADERS);
  }

  const result = await resolveDraftRender({ id: body.id, html: body.html, locals });
  if (!result.ok) {
    return jsonError(result.status, result.message, NO_STORE_PREVIEW_HEADERS);
  }

  return jsonOk({
    html: result.html,
    warnings: result.warnings,
    authorshipCredits: result.authorshipCredits,
  }, NO_STORE_PREVIEW_HEADERS);
};
