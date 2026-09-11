import type { APIRoute } from 'astro';

import { blog } from '@/data/site';
import { jsonBadRequest, jsonError, jsonOk } from '@/lib/http/json-response';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES,
  isGhostAdminPostId,
  type GhostAdminClient,
  type GhostAdminPostTag,
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
import { computeDraftReadiness, type DraftReadiness } from '@/features/posts/server/draft-readiness';
import { renderPostContent } from '@/features/posts/server/rich-content';

// Owner auth is enforced by src/middleware.ts for every /dev/* path — this
// route needs no auth check of its own, same as /dev/blog/[id].astro.
export const prerender = false;

const NO_STORE_PREVIEW_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
} as const;

// Keystrokes hit this endpoint every ~300ms (see draft-live-channel.ts), so
// the slug/title/tags lookup for a given post id is cached for the life of
// the Worker instance. Capped so a long session cannot grow this without
// bound.
interface CachedPostMeta {
  slug: string;
  title: string;
  tags: GhostAdminPostTag[];
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

// canonicalExists (readiness.translation) needs every post's slug, not one
// post by id — a single set for the Worker instance, resolved once and
// reused, the same lifetime as postMetaCache above. Only fetched the first
// time a draft actually declares a translation tag.
let knownSlugsCache: Set<string> | null = null;

async function resolveKnownSlugs(createClient: () => GhostAdminClient): Promise<ReadonlySet<string>> {
  knownSlugsCache ??= new Set((await createClient().listPosts()).map((post) => post.slug));
  return knownSlugsCache;
}

/** Test-only: the two module-level caches above outlive individual requests. */
export function resetDraftRenderCachesForTests(): void {
  postMetaCache.clear();
  knownSlugsCache = null;
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
      readiness: DraftReadiness;
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

  const createClient = () => options.createClient?.() ?? createConfiguredGhostAdminClient(options.locals);

  try {
    let meta = postMetaCache.get(options.id);
    if (!meta) {
      const post = await createClient().readPostById(options.id);
      meta = { slug: post.slug, title: post.title, tags: post.tags };
      cachePostMeta(options.id, meta);
    }

    const [transformed, readiness] = await Promise.all([
      renderPostContent(options.html, {
        slug: meta.slug,
        locale: blog.locale.blog,
        outputTarget: 'preview',
      }),
      computeDraftReadiness(meta.tags, meta.slug, () => resolveKnownSlugs(createClient)),
    ]);

    return {
      ok: true,
      html: transformed.html,
      warnings: transformed.warnings,
      authorshipCredits: readAuthorshipCredits(transformed.meta, meta.slug),
      readiness,
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
    readiness: result.readiness,
  }, NO_STORE_PREVIEW_HEADERS);
};
