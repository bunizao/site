import { describe, expect, test } from 'bun:test';

import {
  activityActorName,
  activityContext,
  activityHref,
  activityPredicate,
  activitySourceLabel,
  activityTone,
} from '../../src/features/admin/activity-copy';
import type { PortalActivityEntry } from '../../src/features/admin/server/portal-client';

function entry(patch: Partial<PortalActivityEntry> = {}): PortalActivityEntry {
  return {
    id: 'ac_1',
    createdAt: '2026-09-03T10:00:00.000Z',
    event: 'reaction.add',
    actor: 'reader',
    source: 'web',
    targetType: 'post',
    targetId: 'post_1',
    postId: 'post_1',
    postTitle: 'A post',
    postSlug: 'a-post',
    displayName: null,
    readerId: null,
    anonymous: true,
    emoji: '❤️',
    status: null,
    reason: null,
    note: null,
    ...patch,
  };
}

describe('activityActorName', () => {
  test('the owner is addressed as themselves', () => {
    expect(activityActorName(entry({ actor: 'owner', displayName: 'Ines' }))).toBe('You');
  });

  // The name on the row is the commenter's, not the actor's, on an owner or
  // model event -- printing it as the subject would credit a takedown to the
  // person it was taken down from.
  test('the model is named, not the comment it ruled on', () => {
    expect(activityActorName(entry({ actor: 'model', displayName: 'Ines' })))
      .toBe('The automatic pass');
  });

  test('an identified reader is named', () => {
    expect(activityActorName(entry({ displayName: 'Ines', anonymous: false }))).toBe('Ines');
  });

  test('an anonymous reactor stays anonymous', () => {
    expect(activityActorName(entry())).toBe('Someone');
  });
});

describe('activityPredicate', () => {
  test('a reaction says what it landed on', () => {
    expect(activityPredicate(entry())).toBe('liked this post');
    expect(activityPredicate(entry({ targetType: 'comment' }))).toBe('liked a comment');
  });

  test('a withdrawn reaction is not the same sentence as a new one', () => {
    expect(activityPredicate(entry({ event: 'reaction.remove' })))
      .toBe('took a like back from this post');
  });

  // The whole reason the log exists: these two land on the same status and
  // are not the same event.
  test('the writer deleting their own comment reads differently from a takedown', () => {
    expect(activityPredicate(entry({ event: 'comment.remove' })))
      .toBe('deleted their own comment');
    expect(activityPredicate(entry({ event: 'comment.delete' })))
      .toBe('deleted a comment');
  });

  test('the model verdict comes from the status it landed on', () => {
    expect(activityPredicate(entry({ event: 'comment.moderate', status: 'held' })))
      .toBe('held it for review');
    expect(activityPredicate(entry({ event: 'comment.moderate', status: 'published' })))
      .toBe('let it through');
  });

  test('an unrecognised status still reads as a sentence', () => {
    expect(activityPredicate(entry({ event: 'comment.moderate', status: null })))
      .toBe('ruled on a comment');
  });
});

describe('activityTone', () => {
  test('taking something away reads as negative, whoever did it', () => {
    for (const event of ['reaction.remove', 'comment.remove', 'comment.hide', 'comment.delete'] as const) {
      expect(activityTone(entry({ event }))).toBe('negative');
    }
  });

  test('an approval is not negative', () => {
    expect(activityTone(entry({ event: 'comment.approve' }))).toBe('owner');
  });
});

describe('activityContext', () => {
  test('a post reaction does not repeat the post it is already about', () => {
    expect(activityContext(entry())).toBeNull();
  });

  test('a comment event names the post it was written under', () => {
    expect(activityContext(entry({ targetType: 'comment' }))).toBe('A post');
  });

  test('falls back to the id when the registry could not name the post', () => {
    expect(activityContext(entry({ targetType: 'comment', postTitle: null }))).toBe('post_1');
  });
});

describe('activityHref', () => {
  test('a published comment links to itself on the blog', () => {
    expect(activityHref(entry({ targetType: 'comment', targetId: 'c1', status: 'published' })))
      .toBe('/blog/a-post/#comment-c1');
  });

  // Offering a link to a held or deleted comment is offering a 404: the
  // public page will not render it.
  test('a comment that is not public gets no link', () => {
    for (const status of ['held', 'rejected', 'deleted']) {
      expect(activityHref(entry({ targetType: 'comment', status }))).toBeNull();
    }
  });

  test('a reaction on a comment carries no status and still links', () => {
    expect(activityHref(entry({ targetType: 'comment', targetId: 'c1', event: 'reaction.add' })))
      .toBe('/blog/a-post/#comment-c1');
  });

  test('no slug means no link, never a broken one', () => {
    expect(activityHref(entry({ postSlug: null }))).toBeNull();
  });
});

describe('activitySourceLabel', () => {
  test('only the owner had a choice of surface', () => {
    expect(activitySourceLabel(entry({ actor: 'owner', source: 'telegram' }))).toBe('from Telegram');
    expect(activitySourceLabel(entry({ actor: 'owner', source: 'portal' }))).toBe('from the portal');
    expect(activitySourceLabel(entry())).toBeNull();
  });
});
