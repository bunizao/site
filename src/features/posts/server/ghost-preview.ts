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
import {
  transformPostDirectives,
  type DirectiveTransformResult,
} from './directives';

const E2E_POST_ID = '5ddc9141c35e7700383b2937';

export type GhostDraftPreviewResult =
  | {
      ok: true;
      post: GhostAdminPost;
      html: string;
      meta: DirectiveTransformResult['meta'];
    }
  | {
      ok: false;
      status: 404 | 500 | 502 | 503 | 504;
      message: string;
    };

export interface ResolveGhostDraftPreviewOptions {
  enabled: boolean;
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
          '<p>[!authors ai="anthropic/claude-opus-4-6" note="reviewed the draft"]</p>',
          '<blockquote><p>E2E preview line — Ada</p></blockquote>',
        ].join(''),
        status: 'draft',
        updatedAt: '2026-07-31T11:59:00.000Z',
      };
    },
  };
}

function createConfiguredClient(locals: RuntimeEnvLocals | undefined): GhostAdminClient {
  return isE2ESiteFixtureEnabled(locals)
    ? e2eGhostAdminClient()
    : createGhostAdminClient({ locals });
}

function mapGhostPreviewError(error: unknown): GhostDraftPreviewResult {
  if (!(error instanceof GhostAdminClientError)) {
    return { ok: false, status: 500, message: 'Ghost draft preview failed.' };
  }

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
  if (!options.enabled || !isGhostAdminPostId(options.id)) {
    return { ok: false, status: 404, message: 'Not found.' };
  }

  try {
    const client = options.createClient?.() ?? createConfiguredClient(options.locals);
    const post = await client.readPostById(options.id);
    const transformed = await transformPostDirectives(post.html, {
      slug: post.slug,
      locale: blog.locale.blog,
      outputTarget: 'preview',
    });

    return {
      ok: true,
      post,
      html: transformed.html,
      meta: transformed.meta,
    };
  } catch (error) {
    return mapGhostPreviewError(error);
  }
}
