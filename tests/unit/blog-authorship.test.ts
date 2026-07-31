import { describe, expect, test } from 'bun:test';

import { resolveAuthorshipModel } from '@/data/authorship';
import {
  transformPostDirectives,
  type DirectiveContext,
} from '@/features/posts/server/directives';
import {
  AuthorshipValidationError,
  readAuthorshipCredits,
  validatePostAuthorship,
} from '@/features/posts/server/directives/authors';

const context = {
  slug: 'authorship-contract',
  locale: 'en',
  outputTarget: 'web',
} satisfies DirectiveContext;

describe('authorship model registry', () => {
  test('resolves a provider-qualified reference to display names', () => {
    expect(resolveAuthorshipModel('anthropic/claude-haiku-4-5')).toMatchObject({
      id: 'anthropic/claude-haiku-4-5',
      providerId: 'anthropic',
      providerName: 'Anthropic',
    });
  });

  test('rejects references that are unqualified, unknown, or malformed', () => {
    for (const reference of [
      'claude-haiku-4-5',
      'anthropic/',
      '/claude-haiku-4-5',
      'anthropic/not-a-model',
      'not-a-provider/claude-haiku-4-5',
    ]) {
      expect(resolveAuthorshipModel(reference), reference).toBeNull();
    }
  });

  test('keys models per provider, since ids are not globally unique', () => {
    // The same model id lives under several providers; each must carry its own
    // provider identity so the credit shows the right mark.
    expect(resolveAuthorshipModel('anthropic/claude-haiku-4-5')?.providerId).toBe('anthropic');
    expect(resolveAuthorshipModel('openai/gpt-5')?.providerId).toBe('openai');
  });
});

describe('authors meta directive', () => {
  test('hoists credits and strips their carrier from every content output', async () => {
    const html = [
      '<p>[!authors ai="anthropic/claude-opus-4-6" note="produced the first draft"]</p>',
      '<p>Article body</p>',
      '<p>[!authors ai="openai/gpt-5"]</p>',
    ].join('');

    for (const outputTarget of ['web', 'excerpt', 'rss', 'agent-markdown'] as const) {
      const result = await transformPostDirectives(html, { ...context, outputTarget });

      expect(result.html).toBe('<p>Article body</p>');
      expect(result.meta).toEqual({
        authors: [
          { ai: 'anthropic/claude-opus-4-6', note: 'produced the first draft' },
          { ai: 'openai/gpt-5' },
        ],
      });
      expect(readAuthorshipCredits(result.meta, context.slug)).toMatchObject([
        {
          model: { id: 'anthropic/claude-opus-4-6', providerId: 'anthropic' },
          note: 'produced the first draft',
        },
        { model: { id: 'openai/gpt-5', providerId: 'openai' } },
      ]);
    }
  });

  test('names a model once, merging repeated credits in written order', async () => {
    const result = await transformPostDirectives(
      [
        '<p>[!authors ai="anthropic/claude-opus-4-6" note="produced the first draft"]</p>',
        '<p>[!authors ai="openai/gpt-5" note="generated the diagrams"]</p>',
        '<p>[!authors ai="anthropic/claude-opus-4-6" note="translated it from Chinese"]</p>',
      ].join(''),
      context,
    );

    expect(readAuthorshipCredits(result.meta, context.slug)).toMatchObject([
      {
        model: { id: 'anthropic/claude-opus-4-6' },
        note: 'produced the first draft, translated it from Chinese',
      },
      { model: { id: 'openai/gpt-5' }, note: 'generated the diagrams' },
    ]);
  });

  test('removes invalid carriers and reports attribute failures with the post slug', async () => {
    const cases = [
      {
        carrier: '[!authors note="drafted this"]',
        message: 'attribute "ai" is required.',
      },
      {
        carrier: '[!authors ai="anthropic/claude-opus-4-6" role="draft"]',
        message: 'unsupported attribute "role".',
      },
      {
        carrier: '[!authors ai="anthropic/claude-opus-4-6" note=""]',
        message: 'attribute "note" must not be empty.',
      },
      {
        carrier: `[!authors ai="anthropic/claude-opus-4-6" note="${'x'.repeat(161)}"]`,
        message: 'attribute "note" must be at most 160 characters.',
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

  test('fails an unknown model through a typed error naming the post and model', async () => {
    try {
      await transformPostDirectives('<p>[!authors ai="anthropic/claude-opus-9-9"]</p>', context);
      throw new Error('Expected authorship validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorshipValidationError);
      expect(error).toMatchObject({
        code: 'unknown-model',
        slug: 'authorship-contract',
        model: 'anthropic/claude-opus-9-9',
      });
    }
  });

  test('reports no credits for a post without the directive', async () => {
    const result = await transformPostDirectives('<p>Article body</p>', context);

    expect(validatePostAuthorship({ slug: context.slug, meta: result.meta })).toEqual([]);
  });
});
