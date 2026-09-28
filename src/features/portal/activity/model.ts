import { activityActorName } from '@/features/admin/activity-copy';
import type { PortalActivityEntry, PortalActivityEvent } from '@/features/admin/server/portal-client';
import { reasonLabel } from '../comments/model';

/* A log row names the act in one or two words; the full sentence lives in
   activity-copy.ts for places that have room for it. A like says whether it
   landed on the post or on a comment; every other event is about a comment
   already. */

const EVENT_WORDS: Record<PortalActivityEvent, string> = {
  'comment.create': 'Commented',
  'comment.edit': 'Edited',
  'comment.remove': 'Withdrew',
  'comment.moderate': 'Ruled',
  'comment.approve': 'Approved',
  'comment.hide': 'Hid',
  'comment.delete': 'Deleted',
  'reaction.add': 'Liked',
  'reaction.remove': 'Unliked',
};

const VERDICTS: Record<string, string> = {
  held: 'Held',
  published: 'Passed',
  rejected: 'Rejected',
};

export const EVENT_LABELS: Record<PortalActivityEvent, string> = {
  'comment.create': 'Comment written',
  'comment.edit': 'Comment edited',
  'comment.remove': 'Comment withdrawn by its writer',
  'comment.moderate': 'Automatic verdict',
  'comment.approve': 'Approved by you',
  'comment.hide': 'Hidden by you',
  'comment.delete': 'Deleted by you',
  'reaction.add': 'Like',
  'reaction.remove': 'Like taken back',
};

/** The act, whether it needs you (only a held comment does), and one
    detail: the emoji of a like, or the reason behind a verdict. */
export function eventWord(entry: PortalActivityEntry): { word: string; attention: boolean; detail: string | null } {
  if (entry.event === 'comment.moderate') {
    const status = entry.status ?? '';
    return { word: VERDICTS[status] ?? EVENT_WORDS[entry.event], attention: status === 'held', detail: reasonLabel(entry.reason) };
  }
  if (entry.event === 'reaction.add' || entry.event === 'reaction.remove') {
    const what = entry.targetType === 'comment' ? 'a comment' : 'the post';
    return { word: `${EVENT_WORDS[entry.event]} ${what}`, attention: false, detail: entry.emoji };
  }
  return { word: EVENT_WORDS[entry.event], attention: false, detail: null };
}

export function whoLabel(entry: PortalActivityEntry): string {
  if (entry.actor === 'model') return 'Automatic pass';
  return activityActorName(entry);
}

/** Where one click on the row goes: the comment in the portal, or the post
    on the public site. Null when there is nowhere to go. */
export function entryTarget(entry: PortalActivityEntry): { to: string; external: boolean } | null {
  if (entry.targetType === 'comment') {
    return { to: `/comments?status=all&c=${encodeURIComponent(entry.targetId)}`, external: false };
  }
  if (entry.postSlug) return { to: `/blog/${entry.postSlug}/`, external: true };
  if (entry.postId && /^\d+$/.test(entry.postId)) return { to: `/mood/${entry.postId}`, external: true };
  return null;
}

export function targetTitle(entry: PortalActivityEntry): string {
  return entry.postTitle ?? entry.postSlug ?? entry.postId ?? entry.targetId;
}
