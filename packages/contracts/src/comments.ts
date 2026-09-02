/**
 * Blog comments, reactions, and reader identity on /blog/[slug]. v2 shape —
 * see plans/blog-comments.md "Decisions taken (v2)" for the model this
 * follows: anonymous-first participation through a risk stack, lazy and
 * stateless email verification, one reader table shared with the newsletter.
 *
 * Reading is open to everyone. Posting a comment or reacting needs only a
 * name, with an optional email — no session, no verification gate. Email verification
 * is an upgrade path (grade L1/L2 in the PRD), never a door charge; the
 * email address itself never crosses this boundary in a response body.
 */

export const READER_PROVIDERS = ['email', 'github', 'google'] as const;

export type ReaderProvider = (typeof READER_PROVIDERS)[number];

export const COMMENT_LOCALES = ['zh', 'en'] as const;
export type CommentLocale = (typeof COMMENT_LOCALES)[number];

/** The reader's standing, from "Identity: three grades, one table":
 *    l0 — `reader_anon` cookie only, nothing verified
 *    l1 — verified email (lazy verification link)
 *    l2 — OAuth (GitHub or Google), phase 3 */
export const READER_GRADES = ['l0', 'l1', 'l2'] as const;

export type ReaderGrade = (typeof READER_GRADES)[number];

export const COMMENT_STATUSES = ['published', 'held', 'rejected', 'deleted'] as const;

export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const MODERATION_ACTIONS = ['publish', 'hold', 'reject', 'unsure'] as const;

export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MODERATION_REASONS = [
  'ok',
  'spam',
  'promotional',
  'abuse',
  'off_topic',
  'personal_info',
] as const;

export type ModerationReason = (typeof MODERATION_REASONS)[number];

/** Never sent to a reader. Rides along on the owner's Telegram notification. */
export interface ModerationVerdict {
  action: ModerationAction;
  reason: ModerationReason;
  /** One short line explaining the call, in the language of the comment. */
  note: string;
}

// ---------------------------------------------------------------------------
// Reader identity
// ---------------------------------------------------------------------------

/** The calling browser's verified reader standing (L1/L2 only — an L0-only
    visitor has no reader row and this is null). Never carries email or
    email_hash; `avatarUrl` is always a same-origin proxy path. */
export interface ReaderMe {
  readerId: string;
  grade: ReaderGrade;
  provider: ReaderProvider;
  displayName: string;
  avatarUrl: string;
  notifyReplies: boolean;
  /** Whether this address holds an active newsletter subscription. */
  subscribed: boolean;
}

export interface ReaderMeResult {
  reader: ReaderMe | null;
}

/** The confirm button's POST — plans/blog-comments.md "Lazy verification". */
export interface ReaderVerifyInput {
  token: string;
  /** Ticked "also subscribe" in the post-comment nudge. Activates the
      subscription in the same POST — one email, one click, both confirmations. */
  subscribe?: boolean;
}

export const READER_VERIFY_OUTCOMES = ['confirmed', 'already_confirmed', 'expired', 'invalid'] as const;

export type ReaderVerifyOutcome = (typeof READER_VERIFY_OUTCOMES)[number];

export interface ReaderVerifyResult {
  outcome: ReaderVerifyOutcome;
  reader: ReaderMe | null;
}

/** One conversation, quieted from the reply mail itself. The token is the
    whole authentication: the reader is usually holding that mail on a device
    that has never signed in here, and an off switch gated behind a sign-in is
    one people reach by marking the sender spam instead. */
export interface ReaderMuteInput {
  token: string;
  /** Omitted or true mutes; false is the undo the landing page offers. */
  muted?: boolean;
}

export const READER_MUTE_OUTCOMES = ['muted', 'unmuted', 'invalid'] as const;

export type ReaderMuteOutcome = (typeof READER_MUTE_OUTCOMES)[number];

export interface ReaderMuteResult {
  outcome: ReaderMuteOutcome;
  /** ISO instant this thread starts mailing again. Only on `muted` — a thread
      mute lapses on its own, which is what makes it safe to press. */
  mutedUntil?: string;
  /** Carried so the page can offer the wider switches without another call. */
  postId?: string;
}

/** Re-send the verification mail. Rate-limited per address; always answers
    the same shape regardless of whether the address has a comment on file,
    so this can never be used to probe which addresses have commented. */
export interface ReaderResendInput {
  email: string;
  /** Carries the original "notify me of replies" intent into the fresh
      verification link, recovered from the stale token's payload. Optional;
      a bare resend defaults to false. */
  notifyReplies?: boolean;
  locale?: CommentLocale;
}

export interface ReaderResendResult {
  ok: boolean;
}

/** The two switches on the confirm page, and the only place a reader can move
    them without an account. Session-authenticated (the cookie the verify POST
    just set), so nothing here names an address. Both fields are optional: the
    page sends only the one that was just toggled. */
export interface ReaderPreferencesInput {
  notifyReplies?: boolean;
  subscribed?: boolean;
}

export interface ReaderPreferencesResult {
  reader: ReaderMe | null;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export const REACTION_TARGET_TYPES = ['post', 'comment'] as const;

export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];

/** The only reaction shipped at launch. The storage layer is emoji-keyed anyway. */
export const DEFAULT_REACTION_EMOJI = '❤️';

/** A face in the avatar stack beside a reaction count. Only identified
    reactors (L1/L2, or an L0 reactor whose claimed email resolves) ever
    appear here — see "Reactions: anonymous counts, identified faces". */
export interface ReactorChip {
  name: string;
  avatarUrl: string | null;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the calling browser (session or reader) holds this reaction. */
  reacted: boolean;
  /** Most recent identified reactors, newest first, capped server-side. */
  reactors: ReactorChip[];
}

/** `${targetType}:${targetId}`, e.g. `post:abc123` or `comment:xyz789`. */
export type ReactionTargetKey = string;

export interface ReactionBatchResult {
  reactions: Record<ReactionTargetKey, ReactionSummary[]>;
}

export interface ReactionToggleInput {
  targetType: ReactionTargetType;
  targetId: string;
  emoji?: string;
  /** Desired final state. Repeating the same request is safe. */
  reacted: boolean;
  /** `expectedAction: 'blog_reaction'` -- plans/blog-comments.md "The risk
      stack" step 2. The widget solves invisibly (managed mode), so this
      never costs the reader a prompt or a round trip of their own. */
  turnstileToken: string;
}

export interface ReactionToggleResult {
  reaction: ReactionSummary;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** Public author view on a comment row. Never includes email or email_hash. */
export interface CommentAuthor {
  name: string;
  /** Same-origin proxy path to the writer's cached avatar, or empty when no
      avatar has resolved for their address (or they left none). Empty means
      "draw your own": the endpoint behind this path answers an identicon for
      any key it does not know, so a path emitted for every address would make
      every face an identicon. */
  avatarUrl: string;
  /** True when this row's writer is the blog owner. */
  byAuthor: boolean;
}

export interface Comment {
  id: string;
  /** Ghost's post.id, stable across slug renames. */
  postId: string;
  /** Always a root comment id, or null. Threading is one level deep. */
  parentId: string | null;
  author: CommentAuthor;
  /** Plain text, 1-2000 chars. Escaping and autolinking happen at render. */
  body: string;
  status: CommentStatus;
  createdAt: string;
  editedAt: string | null;
  /** True when this browser wrote the row (verified reader match, or the
      `reader_anon` session matches). Highlights the row as yours; mutation
      rights are signalled by `editableUntil`/`deletable`, not by this. */
  mine: boolean;
  /** Server clock deadline for the 15-minute edit window, ms since epoch.
      Present only when the viewer is the verified reader who owns the row
      and the window has not closed. Always null for session-owned rows --
      anonymous comments cannot be edited. */
  editableUntil: number | null;
  /** True when the viewer may delete this row: verified reader owns it and
      it is not already a tombstone. Always false for session-owned rows. */
  deletable: boolean;
  /** An address is on file that no reader has claimed yet, so verifying it
      would hand this row's controls to whoever wrote it. False for a row
      posted with no email at all -- that one is unclaimable forever. */
  claimable: boolean;
  /** Soft-deleted but kept as a shape-preserving placeholder because a reply
      hangs underneath it. `body`/`author` are empty on a tombstone. */
  tombstone: boolean;
}

export interface CommentListResult {
  comments: Comment[];
  hasMore: boolean;
  /** Cursor for the next page, or null when `hasMore` is false. */
  nextBefore: string | null;
  /** Published comments on the post (excludes held/rejected/deleted). */
  total: number;
}

export interface CommentCreateInput {
  postId: string;
  body: string;
  /** Root comment id this replies to. Omitted or null for a root comment. */
  parentId?: string | null;
  displayName: string;
  /** Optional. Supplied: must be valid; triggers lazy verification and
      enables claiming and a Gravatar-backed avatar.
      Omitted or empty: the comment is owned by its anon session only and
      the client renders an identicon. */
  email?: string;
  turnstileToken: string;
  /** Visually-hidden honeypot field. Must arrive empty. */
  website?: string;
  /** Signed server timestamp minted at first interaction with the compose
      box — see "The risk stack" step 4 (dwell time). */
  dwellToken: string;
  /** Reader accepted the post-comment subscribe offer. Only takes effect
      once the address is verified. */
  notifyReplies?: boolean;
  locale?: CommentLocale;
}

export const COMMENT_CREATE_OUTCOMES = ['published', 'held'] as const;

export type CommentCreateOutcome = (typeof COMMENT_CREATE_OUTCOMES)[number];

export interface CommentCreateResult {
  outcome: CommentCreateOutcome;
  comment: Comment;
  /** True when a supplied `email` was not already a verified reader — the
      client shows the verification nudge (and, when accepted, the subscribe
      offer). Always false when no email was supplied; the add-an-email
      nudge is driven client-side by the missing address, not by this flag. */
  unverifiedEmail: boolean;
}

export interface CommentEditInput {
  body: string;
}

export interface CommentEditResult {
  comment: Comment;
}

export interface CommentDeleteResult {
  ok: true;
  /** True when the row became a tombstone instead of disappearing, because
      a reply hangs underneath it. */
  tombstone: boolean;
}
