import { describe, expect, test } from 'bun:test';

import { POST, resolveDraftRender } from '../../src/pages/dev/blog/render';
import { DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES } from '../../src/features/posts/server/ghost-admin';
import type { GhostAdminClient, GhostAdminPost } from '../../src/features/posts/server/ghost-admin';

function postFixture(id: string, overrides: Partial<GhostAdminPost> = {}): GhostAdminPost {
  return {
    id,
    uuid: 'a5aa9bd8-ea31-415c-b452-3040dae1e730',
    slug: 'draft-post',
    title: 'Draft post',
    html: '<p>ignored — the render endpoint renders the posted html, not this</p>',
    status: 'draft',
    updatedAt: '2026-07-31T11:59:00.000Z',
    ...overrides,
  };
}

function clientWith(readPostById: GhostAdminClient['readPostById']): GhostAdminClient {
  return {
    readPostById,
    readPostRevisionById: async (id) => (await readPostById(id)).updatedAt,
    listPosts: async () => [],
  };
}

function postRequest(body: unknown): Request {
  return new Request('https://buxx.me/dev/blog/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /dev/blog/render', () => {
  test('rejects a bad id without creating an Admin client', async () => {
    let called = false;
    const result = await resolveDraftRender({
      id: 'not-a-ghost-id',
      html: '<p>hi</p>',
      createClient: () => {
        called = true;
        return clientWith(async () => postFixture('not-a-ghost-id'));
      },
    });

    expect(result).toEqual({ ok: false, status: 400, message: 'Invalid Ghost Admin post ID.' });
    expect(called).toBe(false);
  });

  test('rejects html over the Admin client response cap', async () => {
    const id = '111111111111111111111111';
    const oversized = 'a'.repeat(DEFAULT_GHOST_ADMIN_MAX_RESPONSE_BYTES + 1);
    let called = false;

    const result = await resolveDraftRender({
      id,
      html: oversized,
      createClient: () => {
        called = true;
        return clientWith(async () => postFixture(id));
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 413,
      message: 'Draft HTML exceeds the preview size limit.',
    });
    expect(called).toBe(false);
  });

  test('renders the posted html through the same directive pipeline as the preview page', async () => {
    const id = '222222222222222222222222';
    const paragraphForm = await resolveDraftRender({
      id,
      html: '<p>[!authors ai="anthropic/claude-opus-4-6" note="reviewed the draft"]</p>',
      createClient: () => clientWith(async () => postFixture(id, { slug: 'render-test' })),
    });

    expect(paragraphForm.ok).toBe(true);
    if (!paragraphForm.ok) throw new Error('Expected the render to resolve');
    expect(paragraphForm.html).not.toContain('[!authors');
    expect(paragraphForm.warnings).toEqual([]);
    expect(paragraphForm.authorshipCredits).toMatchObject([{
      model: { id: 'anthropic/claude-opus-4-6' },
      note: 'reviewed the draft',
    }]);

    const directiveForm = await resolveDraftRender({
      id,
      html: '<pre><code class="language-directive">[!authors ai="anthropic/claude-opus-4-6" note="reviewed the draft"]</code></pre>',
      createClient: () => clientWith(async () => postFixture(id, { slug: 'render-test' })),
    });

    expect(directiveForm.ok).toBe(true);
    if (!directiveForm.ok) throw new Error('Expected the render to resolve');
    expect(directiveForm.html).toBe(paragraphForm.html);
  });

  test('caches the resolved slug per id so a second render does not refetch it', async () => {
    const id = '333333333333333333333333';
    let calls = 0;
    const createClient = () => clientWith(async (requestedId) => {
      calls += 1;
      return postFixture(requestedId, { slug: 'cached-slug' });
    });

    const first = await resolveDraftRender({ id, html: '<p>one</p>', createClient });
    const second = await resolveDraftRender({ id, html: '<p>two</p>', createClient });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(calls).toBe(1);
  });

  test('maps Admin client failures to the same statuses as the preview page', async () => {
    const id = '444444444444444444444444';
    const { GhostAdminClientError } = await import('../../src/features/posts/server/ghost-admin');

    const result = await resolveDraftRender({
      id,
      html: '<p>hi</p>',
      createClient: () => clientWith(async () => {
        throw new GhostAdminClientError('timeout', 'Ghost Admin request timed out.');
      }),
    });

    expect(result).toEqual({ ok: false, status: 504, message: 'Ghost draft request timed out.' });
  });

  test('POST handler round-trips a request body end to end', async () => {
    // The e2e fixture client (isE2ESiteFixtureEnabled) only answers its own
    // fixed post id — reuse it here rather than reaching a real Ghost Admin API.
    const response = await POST({
      request: postRequest({ id: '5ddc9141c35e7700383b2937', html: '<p>hello</p>' }),
      locals: { env: { E2E_SITE_FIXTURE: '1' } },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  test('POST handler rejects a malformed body with 400', async () => {
    const invalidJson = await POST({
      request: postRequest('not json'),
      locals: {},
    } as never);
    expect(invalidJson.status).toBe(400);

    const missingHtml = await POST({
      request: postRequest({ id: '666666666666666666666666' }),
      locals: {},
    } as never);
    expect(missingHtml.status).toBe(400);
  });
});
