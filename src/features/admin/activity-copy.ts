/* How one row of the activity log reads.

   Kept out of the .astro page so the sentences can be tested, and because
   the same nine events want the same wording anywhere they end up -- the
   feed today, a comment's own history tomorrow.

   The rule these follow: name the actor, then the act, then what it landed
   on. Not "reaction.add on comment 01J8QK3M7X" -- that is the row, not a
   sentence, and the owner already has the row. */

import type { PortalActivityEntry, PortalActivityEvent } from './server/portal-client';

export type ActivityTone = 'reader' | 'model' | 'owner' | 'negative';

/* Verb phrases, written for a subject that is already printed in front of
   them. "…liked this post", "…took a like back". Reaction removals and owner
   takedowns read as negative so the feed can be scanned for them without
   reading every line. */
const EVENT_COPY: Record<PortalActivityEvent, { verb: string; tone: ActivityTone }> = {
  'comment.create': { verb: 'commented', tone: 'reader' },
  'comment.edit': { verb: 'edited their comment', tone: 'reader' },
  'comment.remove': { verb: 'deleted their own comment', tone: 'negative' },
  'comment.moderate': { verb: 'ruled on a comment', tone: 'model' },
  'comment.approve': { verb: 'approved a comment', tone: 'owner' },
  'comment.hide': { verb: 'hid a comment', tone: 'negative' },
  'comment.delete': { verb: 'deleted a comment', tone: 'negative' },
  'reaction.add': { verb: 'liked', tone: 'reader' },
  'reaction.remove': { verb: 'took a like back from', tone: 'negative' },
};

/* The model does not get a verb of its own for each verdict -- it has one
   act, "ruled", and the verdict is the status it landed on. Saying "the
   automatic pass held it" and "the automatic pass published it" as separate
   events would be two names for one decision. */
const MODEL_VERDICT: Record<string, string> = {
  held: 'held it for review',
  published: 'let it through',
  rejected: 'rejected it',
};

export function activityActorName(entry: PortalActivityEntry): string {
  if (entry.actor === 'owner') return 'You';
  if (entry.actor === 'model') return 'The automatic pass';
  if (entry.displayName) return entry.displayName;
  // An anonymous reactor is not a person the portal knows, and inventing a
  // handle for them would suggest it could tell two of them apart.
  return entry.anonymous ? 'Someone' : 'A reader';
}

export function activityTone(entry: PortalActivityEntry): ActivityTone {
  return EVENT_COPY[entry.event].tone;
}

/** The sentence, minus the actor: "liked this post", "held it for review". */
export function activityPredicate(entry: PortalActivityEntry): string {
  if (entry.event === 'comment.moderate') {
    return MODEL_VERDICT[entry.status ?? ''] ?? 'ruled on a comment';
  }

  const { verb } = EVENT_COPY[entry.event];
  if (entry.event === 'reaction.add' || entry.event === 'reaction.remove') {
    return `${verb} ${entry.targetType === 'post' ? 'this post' : 'a comment'}`;
  }
  return verb;
}

/** Where the act landed, for the second line. Null when the row already said
    it -- a comment event names the post, a post reaction just repeated it. */
export function activityContext(entry: PortalActivityEntry): string | null {
  const post = entry.postTitle ?? entry.postId;
  if (!post) return null;
  if (entry.targetType === 'post' && entry.event.startsWith('reaction.')) return null;
  return post;
}

/** The public link, when the thing is reachable. A held or deleted comment is
    not, so the row stays plain text rather than offering a 404. */
export function activityHref(entry: PortalActivityEntry): string | null {
  if (!entry.postSlug) return null;
  const visible = entry.status === null || entry.status === 'published';
  if (entry.targetType === 'comment' && !visible) return null;
  return entry.targetType === 'comment'
    ? `/blog/${entry.postSlug}/#comment-${entry.targetId}`
    : `/blog/${entry.postSlug}/`;
}

/** "from Telegram", "from the portal" -- only where there was a choice. A
    reader act always comes from the web, and saying so on every row is noise. */
export function activitySourceLabel(entry: PortalActivityEntry): string | null {
  if (entry.actor !== 'owner') return null;
  return entry.source === 'telegram' ? 'from Telegram' : 'from the portal';
}
