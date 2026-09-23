import { describe, expect, test } from 'bun:test';

import type { CommentPolicy } from '../../packages/contracts/src/comments';
import {
  DEFAULT_COMMENT_POLICY,
  acceptsComments,
  commentPolicyFromTags,
} from '../../packages/contracts/src/comments';
import { blog } from '../../src/data/site';

describe('commentPolicyFromTags', () => {
  test('an untagged post gets the site-wide default', () => {
    expect(commentPolicyFromTags([])).toEqual(DEFAULT_COMMENT_POLICY);
    expect(commentPolicyFromTags(null)).toEqual(DEFAULT_COMMENT_POLICY);
    expect(commentPolicyFromTags([{ name: '碎碎念', slug: 'sui-sui-nian' }])).toEqual(
      DEFAULT_COMMENT_POLICY,
    );
  });

  // Both halves of Ghost's pair. The Admin API hands back the name a person
  // typed, the Content API the slug it derived; a tag has to work either way
  // or the two repos disagree about the same post.
  test('matches a tag by name and by slug', () => {
    expect(commentPolicyFromTags([{ name: '#comments-off' }]).mode).toBe('off');
    expect(commentPolicyFromTags([{ slug: 'hash-comments-off' }]).mode).toBe('off');
    expect(commentPolicyFromTags([{ name: '#Comments-Off' }]).mode).toBe('off');
  });

  test('#no-comments still means read-only', () => {
    expect(commentPolicyFromTags([{ name: '#no-comments', slug: 'hash-no-comments' }]).mode)
      .toBe('readonly');
    expect(commentPolicyFromTags([{ name: '#comments-readonly' }]).mode).toBe('readonly');
  });

  test('each tag sets one field and leaves the rest alone', () => {
    expect(commentPolicyFromTags([{ name: '#reactions-off' }])).toEqual({
      mode: 'open',
      reactions: false,
      requireVerifiedEmail: false,
    });
    expect(commentPolicyFromTags([{ name: '#comments-verified' }])).toEqual({
      mode: 'open',
      reactions: true,
      requireVerifiedEmail: true,
    });
  });

  test('tags combine, in any order', () => {
    const forwards = commentPolicyFromTags([
      { name: '#comments-readonly' },
      { name: '#reactions-off' },
    ]);
    const backwards = commentPolicyFromTags([
      { name: '#reactions-off' },
      { name: '#comments-readonly' },
    ]);
    expect(forwards).toEqual({ mode: 'readonly', reactions: false, requireVerifiedEmail: false });
    expect(forwards).toEqual(backwards);
  });

  // A public tag that happens to be called something similar is not a switch:
  // only the `#`/`hash-` form is read, so renaming a reader-facing tag can
  // never quietly close a thread.
  test('a public tag never flips a switch', () => {
    expect(commentPolicyFromTags([{ name: 'comments-off', slug: 'comments-off' }]).mode).toBe('open');
    expect(commentPolicyFromTags([{ name: '#unknown-tag' }])).toEqual(DEFAULT_COMMENT_POLICY);
  });

  test('folds onto a supplied default rather than the shipped one', () => {
    const base = { mode: 'readonly', reactions: false, requireVerifiedEmail: true } as const;
    expect(commentPolicyFromTags([], base)).toEqual(base);
    // One tag overrides one field of it; the other two survive.
    expect(commentPolicyFromTags([{ name: '#comments-off' }], base)).toEqual({
      mode: 'off',
      reactions: false,
      requireVerifiedEmail: true,
    });
  });
});

describe('acceptsComments', () => {
  test('only an open thread takes writes', () => {
    expect(acceptsComments({ ...DEFAULT_COMMENT_POLICY, mode: 'open' })).toBe(true);
    expect(acceptsComments({ ...DEFAULT_COMMENT_POLICY, mode: 'readonly' })).toBe(false);
    expect(acceptsComments({ ...DEFAULT_COMMENT_POLICY, mode: 'off' })).toBe(false);
  });
});

describe('blog.comments', () => {
  // The shipped default, and the thing site-api's COMMENTS_MODE /
  // COMMENTS_REACTIONS / COMMENTS_REQUIRE_VERIFIED_EMAIL have to agree with.
  test('ships open', () => {
    const shipped: CommentPolicy = { mode: 'open', reactions: true, requireVerifiedEmail: false };
    expect({ ...blog.comments } as CommentPolicy).toEqual(shipped);
    // And the contract's own default says the same, so a post the API resolves
    // without a site default lands in the same place the page does.
    expect({ ...DEFAULT_COMMENT_POLICY }).toEqual(shipped);
  });
});
