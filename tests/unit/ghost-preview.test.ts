import { describe, expect, test } from 'bun:test';

import {
  GhostAdminClientError,
  type GhostAdminClient,
  type GhostAdminPost,
} from '@/features/posts/server/ghost-admin';
import { resolveGhostDraftPreview } from '@/features/posts/server/ghost-preview';

const POST_ID = '5ddc9141c35e7700383b2937';
const MISSING_POST_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const POST: GhostAdminPost = {
  id: POST_ID,
  uuid: 'a5aa9bd8-ea31-415c-b452-3040dae1e730',
  slug: 'draft-post',
  title: 'Draft post',
  html: '<blockquote><p>The sea keeps its counsel — Ada</p></blockquote>',
  status: 'draft',
  updatedAt: '2026-07-31T11:59:00.000Z',
};

function clientWith(readPostById: GhostAdminClient['readPostById']): GhostAdminClient {
  return {
    readPostById,
    readPostRevisionById: async (id) => (await readPostById(id)).updatedAt,
  };
}

describe('Ghost draft preview', () => {
  test('rejects invalid editor IDs before creating the Admin client', async () => {
    let didCreateClient = false;
    const result = await resolveGhostDraftPreview({
      id: 'not-a-ghost-id',
      createClient: () => {
        didCreateClient = true;
        return clientWith(async () => POST);
      },
    });

    expect(result).toEqual({ ok: false, status: 404, message: 'Not found.' });
    expect(didCreateClient).toBe(false);
  });

  test('renders Ghost HTML through the real preview directive pipeline', async () => {
    const post = {
      ...POST,
      html: [
        '<p>[!authors ai="anthropic/claude-opus-4-6" note="reviewed the draft"]</p>',
        POST.html,
      ].join(''),
    };
    const result = await resolveGhostDraftPreview({
      id: POST_ID,
      createClient: () => clientWith(async (id) => {
        expect(id).toBe(POST_ID);
        return post;
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected the preview to resolve');
    expect(result.post).toEqual(post);
    expect(result.html).toContain('class="blog-poem"');
    expect(result.html).toContain('<cite class="blog-poem__attribution">— Ada</cite>');
    expect(result.html).not.toContain('[!authors');
    expect(result.authorshipCredits).toMatchObject([{
      model: { id: 'anthropic/claude-opus-4-6' },
      note: 'reviewed the draft',
    }]);
  });

  test('maps client and unexpected failures to sanitized responses', async () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const cases = [
      {
        id: MISSING_POST_ID,
        error: new GhostAdminClientError('not_found', `missing ${secret}`, 404),
        expected: { ok: false, status: 404, message: 'Not found.' },
      },
      {
        id: POST_ID,
        error: new GhostAdminClientError('timeout', `timeout ${secret}`),
        expected: { ok: false, status: 504, message: 'Ghost draft request timed out.' },
      },
      {
        id: POST_ID,
        error: new GhostAdminClientError('invalid_response', `oversized ${secret}`),
        expected: { ok: false, status: 502, message: 'Ghost draft request failed.' },
      },
      {
        id: POST_ID,
        error: new GhostAdminClientError('invalid_configuration', `config ${secret}`),
        expected: { ok: false, status: 503, message: 'Ghost draft preview is unavailable.' },
      },
      {
        id: POST_ID,
        error: new GhostAdminClientError('request_failed', `upstream ${secret}`, 401),
        expected: { ok: false, status: 502, message: 'Ghost draft request failed.' },
      },
      {
        id: POST_ID,
        error: new Error(`unexpected ${secret}`),
        expected: { ok: false, status: 500, message: 'Ghost draft preview failed.' },
      },
    ] as const;

    for (const testCase of cases) {
      const result = await resolveGhostDraftPreview({
        id: testCase.id,
        createClient: () => clientWith(async () => {
          throw testCase.error;
        }),
      });

      expect(result).toEqual(testCase.expected);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });
});
