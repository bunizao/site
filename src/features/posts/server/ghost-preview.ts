import { blog } from '@/data/site';
import { isE2ESiteFixtureEnabled } from '@/lib/e2e';
import type { RuntimeEnvLocals } from '@/lib/runtime/env';
import {
  createGhostAdminClient,
  GhostAdminClientError,
  isGhostAdminPostId,
  type GhostAdminClient,
  type GhostAdminPost,
} from './ghost-admin';
import type { DirectiveTransformResult } from './directives';
import {
  readAuthorshipCredits,
  type AuthorshipCredit,
} from './directives/authors';
import { renderPostContent } from './rich-content';

const E2E_POST_ID = '5ddc9141c35e7700383b2937';

export type GhostDraftPreviewResult =
  | {
      ok: true;
      post: GhostAdminPost;
      html: string;
      authorshipCredits: readonly AuthorshipCredit[];
      warnings: DirectiveTransformResult['warnings'];
      revision: string;
    }
  | GhostDraftPreviewFailure;

export interface GhostDraftPreviewFailure {
  ok: false;
  status: 404 | 500 | 502 | 503 | 504;
  message: string;
}

export type GhostDraftRevisionResult =
  | { ok: true; revision: string }
  | GhostDraftPreviewFailure;

export interface ResolveGhostDraftPreviewOptions {
  id: string;
  locals?: RuntimeEnvLocals;
  createClient?: () => GhostAdminClient;
}

function e2eGhostAdminClient(): GhostAdminClient {
  return {
    async readPostById(id) {
      if (id !== E2E_POST_ID) {
        throw new GhostAdminClientError(
          'not_found',
          'Ghost Admin post was not found.',
          404,
        );
      }

      return {
        id,
        uuid: 'a5aa9bd8-ea31-415c-b452-3040dae1e730',
        slug: 'e2e-ghost-draft',
        title: 'E2E Ghost draft',
        html: [
          '<pre><code>\n[!authors ai=gemini/gemini-3.7-flash note="reviewed the draft"]\n</code></pre>',
          '<pre><code>\n[!music id=1888707290]\n</code></pre>',
          '<pre><code class="language-text">[!authors ai=example/model]</code></pre>',
          '<blockquote><p>E2E preview line — Ada</p></blockquote>',
          '<figure class="kg-card kg-code-card"><pre><code class="language-conversation">',
          '```conversation\n',
          '@conversation avatars=on names=on tints=off\n',
          '@gemini [Gemini] accent=#6E7FD8 tints=on\n',
          'you: preview this draft\n',
          'gemini: render this as conversation\n',
          '```',
          '</code></pre></figure>',
        ].join(''),
        status: 'draft',
        updatedAt: '2026-07-31T11:59:00.000Z',
      };
    },
    async readPostRevisionById(id) {
      if (id !== E2E_POST_ID) {
        throw new GhostAdminClientError(
          'not_found',
          'Ghost Admin post was not found.',
          404,
        );
      }
      return '2026-07-31T11:59:00.000Z';
    },
  };
}

function createConfiguredClient(locals: RuntimeEnvLocals | undefined): GhostAdminClient {
  return isE2ESiteFixtureEnabled(locals)
    ? e2eGhostAdminClient()
    : createGhostAdminClient({ locals });
}

function mapGhostPreviewError(error: unknown): GhostDraftPreviewFailure {
  if (!(error instanceof GhostAdminClientError)) {
    console.error('Ghost draft preview failed.', {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return { ok: false, status: 500, message: 'Ghost draft preview failed.' };
  }

  console.error('Ghost Admin request failed.', {
    code: error.code,
    upstreamStatus: error.status ?? null,
  });

  switch (error.code) {
    case 'invalid_identifier':
    case 'not_found':
      return { ok: false, status: 404, message: 'Not found.' };
    case 'timeout':
      return { ok: false, status: 504, message: 'Ghost draft request timed out.' };
    case 'invalid_configuration':
      return { ok: false, status: 503, message: 'Ghost draft preview is unavailable.' };
    case 'invalid_response':
    case 'request_failed':
      return { ok: false, status: 502, message: 'Ghost draft request failed.' };
  }
}

export async function resolveGhostDraftPreview(
  options: ResolveGhostDraftPreviewOptions,
): Promise<GhostDraftPreviewResult> {
  if (!isGhostAdminPostId(options.id)) {
    return { ok: false, status: 404, message: 'Not found.' };
  }

  try {
    const client = options.createClient?.() ?? createConfiguredClient(options.locals);
    const post = await client.readPostById(options.id);
    const transformed = await renderPostContent(post.html, {
      slug: post.slug,
      locale: blog.locale.blog,
      outputTarget: 'preview',
    });

    return {
      ok: true,
      post,
      html: transformed.html,
      authorshipCredits: readAuthorshipCredits(transformed.meta, post.slug),
      warnings: transformed.warnings,
      revision: post.updatedAt ?? post.id,
    };
  } catch (error) {
    return mapGhostPreviewError(error);
  }
}

export async function resolveGhostDraftRevision(
  options: ResolveGhostDraftPreviewOptions,
): Promise<GhostDraftRevisionResult> {
  if (!isGhostAdminPostId(options.id)) {
    return { ok: false, status: 404, message: 'Not found.' };
  }

  try {
    const client = options.createClient?.() ?? createConfiguredClient(options.locals);
    const updatedAt = await client.readPostRevisionById(options.id);
    return { ok: true, revision: updatedAt ?? options.id };
  } catch (error) {
    return mapGhostPreviewError(error);
  }
}
