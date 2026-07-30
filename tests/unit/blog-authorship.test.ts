import { describe, expect, test } from 'bun:test';

import { AUTHORSHIP_ROLE_DEFINITIONS } from '@/data/authorship';
import {
  transformPostDirectives,
  type DirectiveContext,
} from '@/features/posts/server/directives';
import {
  AuthorshipValidationError,
  readAuthorshipCredits,
  validateAuthorshipPledge,
  validatePostAuthorship,
} from '@/features/posts/server/directives/authors';

const context = {
  slug: 'authorship-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

describe('blog authorship role vocabulary', () => {
  test('keeps every planned role and pledge safety decision in one typed record', () => {
    expect(
      Object.fromEntries(
        Object.entries(AUTHORSHIP_ROLE_DEFINITIONS).map(([role, definition]) => [
          role,
          definition.pledgeSafe,
        ]),
      ),
    ).toEqual({
      draft: false,
      cowrite: false,
      rewrite: false,
      expand: false,
      condense: false,
      translate: false,
      localize: false,
      polish: false,
      proofread: true,
      outline: true,
      restructure: true,
      title: false,
      summarize: false,
      research: true,
      factcheck: true,
      review: true,
      code: true,
      illustrate: true,
      diagram: true,
      data: true,
      transcribe: true,
      alt: true,
    });
  });
});

describe('authors meta directive', () => {
  test('hoists multiple typed credits and strips their carrier from every content output', async () => {
    const html = [
      '<p>[!authors ai="claude-opus-5" role="research, factcheck"]</p>',
      '<p>Article body</p>',
      '<p>[!authors ai="gpt-5" role="translate" from="zh-Hans" to="en"]</p>',
    ].join('');

    for (const outputTarget of ['web', 'excerpt', 'rss', 'agent-markdown'] as const) {
      const result = await transformPostDirectives(html, { ...context, outputTarget });

      expect(result.html).toBe('<p>Article body</p>');
      expect(result.meta).toEqual({
        authors: [
          { ai: 'claude-opus-5', role: 'research,factcheck' },
          { ai: 'gpt-5', role: 'translate', from: 'zh-Hans', to: 'en' },
        ],
      });
      expect(readAuthorshipCredits(result.meta, context.slug)).toEqual([
        {
          ai: 'claude-opus-5',
          roles: ['research', 'factcheck'],
        },
        {
          ai: 'gpt-5',
          roles: ['translate'],
          from: 'zh-Hans',
          to: 'en',
        },
      ]);
    }
  });

  test('removes invalid carriers and reports attribute failures with the post slug', async () => {
    const cases = [
      {
        carrier: '[!authors role="research"]',
        message: 'attribute "ai" is required.',
      },
      {
        carrier: '[!authors ai="claude-opus-5"]',
        message: 'attribute "role" is required.',
      },
      {
        carrier: '[!authors ai="claude-opus-5" role="research" human="Ada"]',
        message: 'unsupported attribute "human".',
      },
      {
        carrier: '[!authors ai="claude-opus-5" role="translate" from="zh"]',
        message: 'attributes "from" and "to" are required with translate or localize.',
      },
      {
        carrier: '[!authors ai="claude-opus-5" role="research" from="zh" to="en"]',
        message: 'attributes "from" and "to" require translate or localize.',
      },
      {
        carrier: '[!authors ai="claude-opus-5" role="translate" from="zh_CN" to="en"]',
        message: 'attribute "from" must be a language tag.',
      },
    ] as const;

    for (const { carrier, message } of cases) {
      const result = await transformPostDirectives(
        `<p>${carrier}</p><p>Article body</p>`,
        context,
      );

      expect(result).toEqual({
        html: '<p>Article body</p>',
        meta: {},
        warnings: [
          {
            code: 'invalid-directive-attributes',
            directive: 'authors',
            slug: 'authorship-contract',
            message: `Invalid "authors" directive in post "authorship-contract": ${message}`,
          },
        ],
      });
    }
  });

  test('fails unknown roles through a typed error naming the post and role', async () => {
    try {
      await transformPostDirectives(
        '<p>[!authors ai="claude-opus-5" role="reseach"]</p>',
        context,
      );
      throw new Error('Expected authorship validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorshipValidationError);
      expect(error).toMatchObject({
        code: 'unknown-role',
        slug: 'authorship-contract',
        role: 'reseach',
        message: 'Unknown authorship role "reseach" in post "authorship-contract".',
      });
    }
  });

  test('allows safe credits with #not-by-ai and rejects unsafe roles through the typed seam', async () => {
    const safeResult = await transformPostDirectives(
      '<p>[!authors ai="claude-opus-5" role="research,proofread"]</p>',
      context,
    );
    const safeCredits = readAuthorshipCredits(safeResult.meta, context.slug);

    expect(() => validateAuthorshipPledge(context.slug, true, safeCredits)).not.toThrow();
    expect(
      validatePostAuthorship({
        slug: context.slug,
        hasNotByAi: true,
        meta: safeResult.meta,
      }),
    ).toEqual(safeCredits);

    const unsafeResult = await transformPostDirectives(
      '<p>[!authors ai="claude-opus-5" role="draft"]</p>',
      context,
    );
    const unsafeCredits = readAuthorshipCredits(unsafeResult.meta, context.slug);

    expect(() => validateAuthorshipPledge(context.slug, false, unsafeCredits)).not.toThrow();
    expect(() => validateAuthorshipPledge(context.slug, true, unsafeCredits)).toThrow(
      expect.objectContaining({
        name: 'AuthorshipValidationError',
        code: 'unsafe-not-by-ai-role',
        slug: 'authorship-contract',
        role: 'draft',
        message: 'Post "authorship-contract" uses #not-by-ai with unsafe authorship role "draft".',
      }),
    );
    expect(() =>
      validatePostAuthorship({
        slug: context.slug,
        hasNotByAi: true,
        meta: unsafeResult.meta,
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'AuthorshipValidationError',
        code: 'unsafe-not-by-ai-role',
        slug: 'authorship-contract',
        role: 'draft',
      }),
    );
  });
});
