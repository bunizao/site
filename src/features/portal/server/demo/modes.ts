/* Demo answers for per-post comment modes: every override, and one post's
   mode read, set and cleared.

   Same paths, validation, error codes and precedence as site-api
   (src/pages/admin/comment-modes/* and features/comments/server/
   comment-modes-admin.ts there). An override replaces the tag mode
   outright; clearing it hands the post back to its tags. A mood post has
   no tags, so its tag mode is the site default. What readers get is then
   at least as strict as the site-wide switch (site-policy.ts). GET and PUT
   answer 404 `post_not_found` for a post the registry does not know;
   DELETE works on any row, so a stale one can always be cleared. The demo
   never answers 503 `post_lookup_unavailable`: its registry is always
   there.

   The registry is the demo Ghost list's published posts (what the portal's
   post search offers) plus every post the demo comments sit on.

   Dispatched from demo-api.ts. A unit test passes its own store; the dev
   server seeds one from the demo comments on first use. Only imported
   behind `import.meta.env.DEV`. */

import {
  COMMENT_SURFACES,
  COMMENTS_MODES,
  type AdminCommentModeListResult,
  type AdminCommentModeResponse,
  type AdminCommentModeState,
  type AdminCommentRecord,
  type CommentSurface,
  type CommentsMode,
} from '@bunizao/contracts';
import { demoSiteMode, stricterMode } from './site-policy';
import { demoGhostPosts } from './tools';

const DAY = 86_400_000;
const POST_ID_MAX_LENGTH = 64;
/** SITE_COMMENTS_MODE when unset: what a mood post gets. */
const SITE_DEFAULT_MODE: CommentsMode = 'open';

export interface DemoModePost {
  surface: CommentSurface;
  postId: string;
  title: string;
  slug: string;
  tagMode: CommentsMode;
}

interface Override {
  mode: CommentsMode;
  updatedAt: string;
}

export interface ModesStore {
  posts: DemoModePost[];
  /** By `${surface}:${postId}`. */
  overrides: Map<string, Override>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code, message: code }, status);
}

const keyOf = (surface: string, postId: string) => `${surface}:${postId}`;

function isMode(value: unknown): value is CommentsMode {
  return typeof value === 'string' && (COMMENTS_MODES as readonly string[]).includes(value);
}

function findPost(store: ModesStore, surface: CommentSurface, postId: string): DemoModePost | null {
  return store.posts.find((post) => post.surface === surface && post.postId === postId) ?? null;
}

/** site-api's toModeState. */
function stateOf(surface: CommentSurface, postId: string, override: Override | null, post: DemoModePost | null): AdminCommentModeState {
  const tagMode = post?.tagMode ?? null;
  const own = override?.mode ?? tagMode;
  return {
    surface,
    postId,
    override: override?.mode ?? null,
    tagMode,
    effectiveMode: own && stricterMode(own, demoSiteMode()),
    updatedAt: override?.updatedAt ?? null,
    title: post?.title ?? null,
    slug: post?.slug ?? null,
  };
}

function list(store: ModesStore): Response {
  const modes = [...store.overrides]
    .map(([key, override]) => {
      const cut = key.indexOf(':');
      const surface = key.slice(0, cut) as CommentSurface;
      const postId = key.slice(cut + 1);
      return stateOf(surface, postId, override, findPost(store, surface, postId));
    })
    // ORDER BY surface, post_id
    .sort((a, b) => a.surface.localeCompare(b.surface) || a.postId.localeCompare(b.postId));
  return json({ modes } satisfies AdminCommentModeListResult);
}

async function one(store: ModesStore, request: Request, method: string, surface: string, postId: string): Promise<Response | null> {
  if (!(COMMENT_SURFACES as readonly string[]).includes(surface) || !postId || postId.length > POST_ID_MAX_LENGTH) {
    return fail(400, 'invalid_post');
  }
  const target = surface as CommentSurface;
  const key = keyOf(target, postId);
  const post = findPost(store, target, postId);

  if (method === 'GET') {
    if (!post) return fail(404, 'post_not_found');
    return json({ mode: stateOf(target, postId, store.overrides.get(key) ?? null, post) } satisfies AdminCommentModeResponse);
  }
  if (method === 'PUT') {
    let body: { mode?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return fail(400, 'invalid_json');
    }
    if (!isMode(body?.mode)) return fail(400, 'invalid_mode');
    if (!post) return fail(404, 'post_not_found');
    const override = { mode: body.mode, updatedAt: new Date().toISOString() };
    store.overrides.set(key, override);
    return json({ mode: stateOf(target, postId, override, post) } satisfies AdminCommentModeResponse);
  }
  if (method === 'DELETE') {
    store.overrides.delete(key);
    return json({ mode: stateOf(target, postId, null, post) } satisfies AdminCommentModeResponse);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

/** Tag modes by slug: what `#comments-readonly` and `#comments-off` give. */
const TAGGED: Record<string, CommentsMode> = {
  'shell-work-before-polish': 'readonly',
  'demo-effects': 'off',
  'shipping-on-friday': 'readonly',
};

const MOOD_POSTS: Array<{ postId: string; title: string }> = [
  { postId: '2841', title: '今天把阳台的花都换了盆' },
  { postId: '2836', title: 'Late train, good book' },
  { postId: '2790', title: '第一次在家做了酸面包，失败但好吃' },
];

/** The registry: published demo Ghost posts, then the posts under the demo
    comments, then a few mood posts. */
export function modePosts(comments: readonly AdminCommentRecord[]): DemoModePost[] {
  const posts = new Map<string, DemoModePost>();
  const add = (post: DemoModePost) => {
    if (!posts.has(keyOf(post.surface, post.postId))) posts.set(keyOf(post.surface, post.postId), post);
  };
  for (const post of demoGhostPosts()) {
    if (post.status !== 'published') continue;
    add({ surface: 'blog', postId: post.id, title: post.title, slug: post.slug, tagMode: TAGGED[post.slug] ?? 'open' });
  }
  for (const comment of comments) {
    const surface: CommentSurface = comment.surface ?? (/^\d+$/.test(comment.postId) ? 'mood' : 'blog');
    const slug = comment.postSlug ?? comment.postId;
    add({
      surface,
      postId: comment.postId,
      title: comment.postTitle ?? comment.postId,
      slug,
      tagMode: surface === 'mood' ? SITE_DEFAULT_MODE : TAGGED[slug] ?? 'open',
    });
  }
  for (const mood of MOOD_POSTS) add({ surface: 'mood', ...mood, slug: mood.postId, tagMode: SITE_DEFAULT_MODE });
  return [...posts.values()];
}

/** Three overrides on live posts and one on a post that no longer exists. */
export function seedModes(posts: DemoModePost[], now = Date.now()): ModesStore {
  const at = (days: number) => new Date(now - days * DAY).toISOString();
  const overrides = new Map<string, Override>();
  const bySlug = (slug: string) => posts.find((post) => post.surface === 'blog' && post.slug === slug);
  const quiet = bySlug('quiet-architecture');
  const retry = bySlug('retry-budget');
  const shell = bySlug('shell-work-before-polish');
  if (quiet) overrides.set(keyOf('blog', quiet.postId), { mode: 'off', updatedAt: at(3) });
  if (retry) overrides.set(keyOf('blog', retry.postId), { mode: 'readonly', updatedAt: at(9) });
  if (shell) overrides.set(keyOf('blog', shell.postId), { mode: 'open', updatedAt: at(12) });
  overrides.set(keyOf('mood', '2841'), { mode: 'readonly', updatedAt: at(1) });
  overrides.set(keyOf('blog', '6600dead00000000000000ff'), { mode: 'off', updatedAt: at(40) });
  return { posts, overrides };
}

let devStore: ModesStore | null = null;

/** Back to the seed, for demo-api.ts's reset: the next request re-seeds. */
export function resetCommentModesDemo(): void {
  devStore = null;
}

/** Answers `admin/comment-modes[/…]`, or null for a path this module does
    not own. `segments` starts after `admin`; `comments` seeds the dev
    registry on first use. */
export async function handleCommentModesDemo(
  request: Request,
  segments: string[],
  comments: readonly AdminCommentRecord[],
  store?: ModesStore,
): Promise<Response | null> {
  const [resource, ...rest] = segments;
  if (resource !== 'comment-modes') return null;
  const modes = store ?? (devStore ??= seedModes(modePosts(comments)));
  const method = request.method.toUpperCase();
  if (rest.length === 0) return method === 'GET' ? list(modes) : null;
  if (rest.length === 2) return one(modes, request, method, rest[0], rest[1]);
  return null;
}
