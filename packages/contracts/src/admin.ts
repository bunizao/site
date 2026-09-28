import type {
  ClientFingerprint,
  CommentAuthAtWrite,
  CommentClaimMethod,
  CommentsMode,
  CommentStatus,
  CommentSurface,
  Interaction,
} from './comments';
import type { MessageLocale, MessageState } from './messages';
import type {
  DeliveryMode,
  NotifyAuditEventType,
  NotifyChannel,
  SubscriberRecord,
  SubscriberStatus,
} from './notify';

export interface SubscriberChannelCount {
  total: number;
  pendingCount: number;
  activeCount: number;
  unsubscribedCount: number;
}

export type SubscriberChannelCounts = Record<NotifyChannel, SubscriberChannelCount>;
export type BroadcastPreviewChannelCounts = Partial<Record<NotifyChannel, number>>;

export interface SubscriberFilter {
  status?: SubscriberStatus | 'all';
  channel?: NotifyChannel;
  deliveryMode?: DeliveryMode;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SubscriberListResult {
  rows: SubscriberRecord[];
  total: number;
  pendingCount: number;
  activeCount: number;
  unsubscribedCount: number;
  channelCounts?: SubscriberChannelCounts;
}

export interface AuditEntry {
  id: number;
  eventType: NotifyAuditEventType;
  email: string;
  emailHash: string;
  source: string;
  createdAt: string;
  userAgent?: string;
}

export interface AdminSubscriberInput {
  email: string;
  status: SubscriberStatus;
  channels: NotifyChannel[];
  deliveryMode: DeliveryMode;
  timezone?: string;
  dailyHour?: number;
}

export interface AdminSubscriberPatch {
  status?: SubscriberStatus;
  channels?: NotifyChannel[];
  deliveryMode?: DeliveryMode;
  timezone?: string | null;
  dailyHour?: number | null;
}

export interface BroadcastAudience {
  status: SubscriberStatus | 'active';
  channels: NotifyChannel[];
  deliveryModes?: DeliveryMode[];
}

export interface BroadcastInput {
  subject: string;
  body: string;
  audience: BroadcastAudience;
}

export interface BroadcastRecord {
  id: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  audience: BroadcastAudience;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  createdAt: string;
  sentAt: string | null;
  sentBy: string;
}

export interface BroadcastPreviewResult {
  subject: string;
  html: string;
  text: string;
  recipientCount: number;
  channelCounts?: BroadcastPreviewChannelCounts;
}

export interface BroadcastSendResult {
  id: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: BroadcastRecord['status'];
}

// ---------------------------------------------------------------------------
// Blog comments: the queue row, the actor behind it, sources, insights, bans
// ---------------------------------------------------------------------------
//
// Admin-only shapes, read through the portal's service binding. They live
// here rather than beside the notify types above because both Workers draw
// them: site-api builds them, site renders them, and a divergence between the
// two is exactly the bug a shared contract exists to make impossible. See
// plans/comment-actor-identity.md "Admin read model".

/** The queue's status filter; the same four values as `CommentStatus`, in
    the order the portal tabs show them. */
export type AdminCommentStatus = CommentStatus;

/** One row of the comment queue. The public `Comment` never carries the
    writer's standing or the moderation verdict; this does, and adds the
    actor block that says where the row came from. */
export interface AdminCommentRecord {
  id: string;
  postId: string;
  parentId: string | null;
  author: string;
  /** True when the writer had a confirmed identity at the time of writing. */
  verified: boolean;
  body: string;
  status: AdminCommentStatus;
  moderationAction: string | null;
  moderationReason: string | null;
  moderationNote: string | null;
  moderationModel: string | null;
  country: string | null;
  createdAt: string;
  editedAt: string | null;
  /** Filled from the post registry; null when it could not say. A mood
      post has no slug: `postSlug` is always null for one, and `postPath`
      carries the link. */
  postTitle: string | null;
  postSlug: string | null;
  actor: AdminCommentActor;
  /* site-api always sends the four below. They are optional only so
     records built elsewhere (the portal's demo api) keep compiling until
     they fill them; make them required then. */
  surface?: CommentSurface;
  /** When the latest verdict, automatic or the owner's, was written. */
  moderatedAt?: string | null;
  updatedAt?: string;
  /** A deleted row the owner can still restore: the last instant it can.
      Null for every other row. */
  restorableUntil?: string | null;
  /* The owner's pin and thread lock, only ever set on a root. site-api
     sends both; optional like the four above, and absent reads as neither. */
  /** When the owner pinned this root to the top of its post. A pin on a
      row that is no longer published stays set and shows again with it. */
  pinnedAt?: string | null;
  /** When the owner locked replies under this root. */
  lockedAt?: string | null;
  /* site-api sends both below; optional like the four above. */
  /** The post's page on the public site, as a path: `/blog/<slug>` or
      `/mood/<id>`. Null when the post could not be looked up. */
  postPath?: string | null;
  /** The owner wrote it: the public `CommentAuthor.byAuthor` rule, a row
      written signed in by the reader whose address is the owner's. */
  byAuthor?: boolean;
}

/** One page of the moderation queue. */
export interface AdminCommentListResult {
  comments: AdminCommentRecord[];
  /** Rows matching the filter, ignoring the page window. */
  total: number;
  /** `offset + comments.length`, or null on the last page. */
  nextOffset: number | null;
}

/** The numbers drawn above the queue. */
export interface AdminCommentSummary {
  byStatus: Record<AdminCommentStatus, number>;
  /** Comments written in the last 24 hours. */
  today: number;
  oldestHeldAt: string | null;
  reasons: Array<{ reason: string; count: number }>;
  /** `slug` and `path` as on AdminCommentRecord's `postSlug` and
      `postPath`; `path` is optional only for the portal's demo api. */
  topPosts: Array<{ surface: CommentSurface; postId: string; count: number; title: string | null; slug: string | null; path?: string | null }>;
  daily: Array<{ date: string; count: number }>;
}

export type AdminCommentQueueSort = 'newest' | 'oldest' | 'risk';
/** `akismet` alone, `llm` for Akismet plus the second opinion, `none` for
    rows no model judged. */
export type AdminCommentModelFilter = 'akismet' | 'llm' | 'none';

/** The created-at window a queue page was read over. Search and the risk
    sort always read one (30 days unless asked, 90 at most). */
export interface AdminCommentQueueWindow {
  from: string | null;
  to: string | null;
  /** True when the window asked for was wider than 90 days and was cut to
      the 90 before its end; `from` is then where the read started. */
  clamped?: boolean;
}

/** GET /admin/comments. */
export interface AdminCommentQueueResult extends AdminCommentListResult {
  summary: AdminCommentSummary;
  window: AdminCommentQueueWindow | null;
}

export type AdminCommentAction = 'approve' | 'hide' | 'reject' | 'delete' | 'restore';

export const ADMIN_COMMENT_REJECT_REASONS = ['spam', 'promotional', 'abuse', 'off_topic', 'personal_info'] as const;
export type AdminCommentRejectReason = (typeof ADMIN_COMMENT_REJECT_REASONS)[number];

/** What one act did to one row. `already_*` is a repeat that changed
    nothing; `not_restorable` is a deleted row past its window or removed in
    a way restore cannot undo; `not_available` is a row gone, or in a state
    the act cannot leave. */
export type AdminCommentActionResult =
  | 'approved'
  | 'hidden'
  | 'rejected'
  | 'deleted'
  | 'restored'
  | 'already_approved'
  | 'already_hidden'
  | 'already_rejected'
  | 'already_deleted'
  | 'not_restorable'
  | 'not_available';

/** POST /admin/comments/:id. `reason` is required for `reject`. */
export interface AdminCommentActionRequest {
  action: AdminCommentAction;
  reason?: AdminCommentRejectReason;
}

export interface AdminCommentActionResponse {
  result: AdminCommentActionResult;
  comment: { id: string; status: AdminCommentStatus };
}

/** POST /admin/comments/bulk: at most 20 ids, applied as one batch. */
export interface AdminCommentBulkRequest {
  ids: string[];
  action: AdminCommentAction;
  reason?: AdminCommentRejectReason;
}

/** One result per id, in the order sent. `status` is the row's status
    after the call whatever the result, so a `not_available` row says where
    it actually is; it is null only when no row has that id. */
export interface AdminCommentBulkResponse {
  results: Array<{ id: string; result: AdminCommentActionResult; status: AdminCommentStatus | null }>;
}

/** POST /admin/comments/:id/reply. */
export interface AdminCommentReplyRequest {
  body: string;
  /** A UUID made once per reply and sent again on every retry: it becomes
      the reply's id, so a retry answers the first reply instead of posting
      a second. The same id with another body or comment is a 409
      `reply_id_collision`. Omitted, every call posts a new reply. */
  replyId?: string;
}

/** `parentId` is the thread root the reply joined. */
export interface AdminCommentReplyResponse {
  comment: { id: string; parentId: string; status: AdminCommentStatus };
}

/** The site-wide lockdown: every anonymous comment waits for an email
    until `until`. */
export interface AdminCommentLockdown {
  reason: string;
  since: string;
  until: string;
  by: 'auto' | 'owner';
}

/** POST /admin/comments/lockdown: 1 to 10080 minutes, note up to 200
    characters. */
export interface AdminCommentLockdownRequest {
  minutes: number;
  note?: string;
}

/** GET, POST and DELETE /admin/comments/lockdown. */
export interface AdminCommentLockdownResponse {
  lockdown: AdminCommentLockdown | null;
}

/** PUT and DELETE /admin/comments/:id/pin. `replaced` is the comment the
    PUT took the post's pin from, or null; always null on DELETE. */
export interface AdminCommentPinResponse {
  comment: { id: string; surface: CommentSurface; postId: string; pinnedAt: string | null };
  replaced: string | null;
}

/** PUT and DELETE /admin/comments/:id/lock. `comment` is the thread root,
    which is not the id in the path when that was a reply. */
export interface AdminCommentLockResponse {
  comment: { id: string; surface: CommentSurface; postId: string; lockedAt: string | null };
}

/** One post's comment mode as the portal shows it: the portal's override
    beside what the post's tags give (the site default for a mood post). */
export interface AdminCommentModeState {
  surface: CommentSurface;
  postId: string;
  /** Null when the tags decide. */
  override: CommentsMode | null;
  /** Null when the post could not be looked up. */
  tagMode: CommentsMode | null;
  /** What readers get: `override`, else `tagMode`. */
  effectiveMode: CommentsMode | null;
  /** When the override was last set; null without one. */
  updatedAt: string | null;
  title: string | null;
  /** Blog only; null for a mood post, which has no slug. */
  slug: string | null;
  /** The post's page as a path, `/blog/<slug>` or `/mood/<id>`; null when
      the post could not be looked up. Optional only for the portal's demo
      api; site-api sends it. */
  path?: string | null;
}

/** GET /admin/comment-modes: every overridden post. */
export interface AdminCommentModeListResult {
  modes: AdminCommentModeState[];
}

/** PUT /admin/comment-modes/:surface/:postId. */
export interface AdminCommentModeRequest {
  mode: CommentsMode;
}

/** GET, PUT and DELETE /admin/comment-modes/:surface/:postId. */
export interface AdminCommentModeResponse {
  mode: AdminCommentModeState;
}

/** One message sent through /message, as the owner's inbox shows it. The
    body is private: it never leaves the admin routes. */
export interface AdminOwnerMessage {
  id: string;
  state: MessageState;
  displayName: string;
  body: string;
  locale: MessageLocale;
  /** The reader the address resolves to. It proves who wrote the message
      only when `authAtWrite` is `verified`. */
  readerId: string | null;
  /** `verified` when a signed-in reader's session sent it; `anonymous` when
      the address was typed. Missing on older responses means unknown. */
  authAtWrite?: CommentAuthAtWrite;
  /** Null when the sender left no address. */
  emailHash: string | null;
  /** Why the risk stack filed it as spam, and which model said so. */
  spamNote: string | null;
  spamModel: string | null;
  repliedAt: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/messages `state`: one state, or `inbox` for new, read and
    replied together -- everything not archived or spam. */
export type AdminOwnerMessageFilter = MessageState | 'inbox';

/** GET /admin/messages. `counts` covers the whole inbox whatever the
    filter; `total` is the filtered count. */
export interface AdminOwnerMessageListResult {
  messages: AdminOwnerMessage[];
  counts: Record<MessageState, number>;
  total: number;
  nextOffset: number | null;
}

/** Whether a reply would reach the sender, and if not, why. */
export type AdminOwnerMessageReplyability = 'ok' | 'no_address' | 'unverified' | 'suppressed';

/** GET /admin/messages/:id. `history` is what else the same address sent,
    newest first; `sender.email` is set only when a reply can reach it. */
export interface AdminOwnerMessageDetail {
  message: AdminOwnerMessage;
  sender: { replyable: AdminOwnerMessageReplyability; email: string | null; readerId: string | null };
  history: AdminOwnerMessage[];
  /** The sender's keys and signals, in the comment writer's shape; `cluster`
      counts comments, reactions and messages. Absent from a site-api that
      predates it. */
  actor?: AdminCommentActor;
}

export type AdminOwnerMessageAction = 'read' | 'archive' | 'unarchive' | 'spam' | 'unspam';

/** POST /admin/messages/:id. */
export interface AdminOwnerMessageActionRequest {
  action: AdminOwnerMessageAction;
}

/** `changed` is false when the message was already past the act; `message`
    is then what it is now. */
export interface AdminOwnerMessageActionResponse {
  message: AdminOwnerMessage;
  changed: boolean;
}

/** POST /admin/messages/:id/reply: 2 to 4000 characters. */
export interface AdminOwnerMessageReplyRequest {
  body: string;
}

/** `recipientEmail` is masked. */
export interface AdminOwnerMessageReplyResponse {
  message: AdminOwnerMessage;
  recipientName: string;
  recipientEmail: string;
}

/** What a ban can hold onto. Values are hashes (or the ASN as text) for
    every kind but the two domain kinds, which are stored raw -- a domain is
    not personal data. `client_fp` matches either the exact or the stable
    device hash. */
export type AdminBanKeyType =
  | 'email'
  | 'session'
  | 'ip'
  | 'ip24'
  | 'fp'
  | 'asn'
  | 'client_fp'
  | 'domain'
  | 'email_domain';

export type AdminBanSource = 'portal' | 'telegram' | 'script';

/** One key a queue row, a reaction, or a source profile can be pivoted on:
    `GET /admin/comments?key=&value=`, `GET /admin/reactions?key=&value=`
    and `GET /admin/sources/:type/:value` all take one of these. Every ban
    key type is also a source key type; the rest are cluster keys that can be
    looked at but not banned. */
export type AdminSourceKeyType =
  | AdminBanKeyType
  | 'client_fp_stable'
  | 'storage_id'
  | 'body_hash';

/** The `signals` blob on a row: the request's network and header set,
    serialised once at insert and nulled by the 90-day sweep. */
export interface ActorDetail {
  colo: string | null;
  region: string | null;
  timezone: string | null;
  httpProtocol: string | null;
  tlsVersion: string | null;
  tlsCipher: string | null;
  tlsCiphersSha1: string | null;
  tlsExtensionsSha1: string | null;
  tlsHelloLength: number | null;
  rttMs: number | null;
  /** From the static hosting-ASN list; a vpn hint, not a bot hint. */
  asnKind: 'hosting' | 'other' | null;
  acceptLanguage: string | null;
  acceptEncoding: string | null;
  chUa: string | null;
  chPlatform: string | null;
  chMobile: string | null;
  /** `sec-fetch-dest/mode/site` joined with `/`. */
  secFetch: string | null;
  priority: string | null;
  referer: string | null;
  origin: string | null;
  /** `cf-worker` header present: the request came out of another Worker. */
  viaWorker: boolean;
}

/** The `client` blob on a row: the fingerprint components and interaction
    aggregates exactly as the browser sent them (bounded), plus the hint
    lists the server derived from them and the headers together. */
export interface ActorClient {
  components: ClientFingerprint | null;
  interaction: Interaction | null;
  /** Contradictions that count into the row's `botHints` total. */
  botHints: string[];
  /** Contradictions shown and not counted: what a VPN looks like. */
  vpnHints: string[];
}

/** Behavioural integers, kept past the sweep. Comments carry dwell, the
    Turnstile age, the link count and the MX result; reactions carry the
    Turnstile age and which door the heart came through. */
export interface AdminActorBehaviour {
  dwellMs?: number | null;
  turnstileAgeMs?: number | null;
  linkCount?: number | null;
  emailMx?: boolean | null;
  emailGravatar?: boolean | null;
  auth?: 'turnstile' | 'pass' | 'verified' | null;
}

/** The row's keys, at full length: the portal shortens a hash to its first
    eight characters for the eye and keeps the whole value for the pivot
    link. Domains are raw, and `session` is '' when the row predates
    sessions. */
export interface AdminActorKeys {
  session: string;
  ip: string | null;
  ip24: string | null;
  fp: string | null;
  email: string | null;
  clientFp: string | null;
  clientFpStable: string | null;
  storageId: string | null;
  emailDomain: string | null;
  bodyHash: string | null;
  linkDomains: string[];
}

export type AdminClusterKey =
  | 'session'
  | 'ip'
  | 'ip24'
  | 'fp'
  | 'email'
  | 'clientFp'
  | 'clientFpStable'
  | 'storageId'
  | 'emailDomain'
  | 'bodyHash';

export interface AdminClusterCount {
  comments: number;
  held: number;
  reactions: number;
  /** Owner messages sharing the key. Absent from a site-api that predates it. */
  messages?: number;
}

/** Where a row came from, as far as the write path could tell. Shared by
    comments and reactions; a reaction's block has no email, no link domains
    and no body hash. */
export interface AdminCommentActor {
  readerId: string | null;
  /** Missing on older responses means unknown, not authenticated. */
  authAtWrite?: CommentAuthAtWrite;
  claimedAt?: string | null;
  claimMethod?: CommentClaimMethod | null;
  /** Plaintext while the row still holds it (verified: with the row;
      unverified: seven days). */
  email: string | null;
  /** Plaintext while inside the 90-day window. */
  ip: string | null;
  ua: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  asn: number | null;
  asOrg: string | null;
  /** This write minted the anonymous session cookie. */
  sessionNew: boolean;
  /** Count of tripped bot hints; the names are in `client.botHints`. */
  botHints: number;
  /** The `signals` blob, parsed. Null once the sweep has run. */
  detail: ActorDetail | null;
  /** The `client` blob, parsed. Null when the write carried neither
      fingerprint nor interaction, or once the sweep has run. */
  client: ActorClient | null;
  behaviour: AdminActorBehaviour;
  keys: AdminActorKeys;
  /** Which of this row's keys are on the ban list right now. */
  banned: AdminBanKeyType[];
  /** Other rows sharing each key in the last 90 days, excluding this one. */
  cluster: Record<AdminClusterKey, AdminClusterCount>;
  /** Same, per link domain on this row. */
  domainCluster: Array<{ domain: string; comments: number; held: number; banned: boolean }>;
  /** Published comments at this email domain in the last 90 days.
      Missing or null means the broad domain ban cannot be evaluated. */
  emailDomainPublishedComments?: number | null;
}

/** One reaction row as the reactions list shows it. */
export interface AdminReactionRecord {
  /** ULID, like a comment id. */
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  postId: string | null;
  postTitle: string | null;
  postSlug: string | null;
  emoji: string;
  createdAt: string;
  actor: AdminCommentActor;
}

export interface AdminReactionListResult {
  reactions: AdminReactionRecord[];
  total: number;
  nextOffset: number | null;
}

export interface AdminBan {
  keyType: AdminBanKeyType;
  keyValue: string;
  note: string | null;
  source: AdminBanSource;
  createdAt: string;
  expiresAt: string | null;
  /** Rows in the last 90 days, both tables, matching this key. */
  hits: number;
}

/** `POST /admin/bans`: every key in one write. With `purge`, the source's
    comments from the last 90 days are soft-deleted and its reaction rows
    removed, each logged. `revokeReaderId` flips `notify_subscribers.banned`
    for a verified writer -- the account lever, offered on verified rows. */
export interface AdminBanInput {
  keys: Array<{ type: AdminBanKeyType; value: string }>;
  note?: string;
  expiresAt?: string | null;
  purge?: boolean;
  /** Keys a purge also matches without banning them, such as the writer's
      device fingerprint. Ignored unless `purge` is set. */
  sweepKeys?: Array<{ type: AdminBanKeyType; value: string }>;
  /** The comment the ban was raised from. It is removed in the same
      restorable operation whatever `purge` says, and its writer is the one
      signed-in reader a purge may remove published comments from. */
  removeCommentId?: string | null;
  revokeReaderId?: string | null;
}

/** `POST /admin/bans/preview`: the scope `POST /admin/bans` would reach with
    the same fields. */
export type AdminBanPreviewInput = Pick<AdminBanInput, 'keys' | 'revokeReaderId' | 'purge' | 'sweepKeys' | 'removeCommentId'>;

export interface AdminBanResult {
  bans: AdminBan[];
  purged: { comments: number; reactions: number };
  operation?: AdminBanOperation | null;
}

export interface AdminBanPreview {
  accounts: number;
  sessions: number;
  comments: Record<AdminCommentStatus | 'total', number>;
  reactions: number;
  /** What the ban would really remove. The optional fields are absent from
      a site-api that predates them. */
  purge: {
    comments: number;
    reactions: number;
    /** Of `comments`, the ones readers can see now. */
    published?: number;
    /** Distinct sessions the removed rows came from. */
    sessions?: number;
    /** Reader accounts, other than the target comment's own, that lose a row. */
    otherAccounts?: number;
  };
  /** Published comments a purge leaves alone because another signed-in
      reader wrote them. Absent from a site-api that predates the rule. */
  spared?: number;
  windowDays: 90;
  purgeLimit: number;
  purgeAllowed: boolean;
}

export interface AdminBanOperation {
  id: string;
  createdAt: string;
  source: AdminBanSource;
  keys: AdminBanInput['keys'];
  note: string | null;
  purged: { comments: number; reactions: number };
  restoredAt: string | null;
  restorableUntil: string;
  restored: { comments: number; reactions: number };
  skipped: { comments: number; reactions: number };
}

export interface AdminBanOperationListResult {
  operations: AdminBanOperation[];
}

export interface AdminBanRestoreResult {
  operation: AdminBanOperation;
}

export interface AdminBanListResult {
  bans: AdminBan[];
}

/** A reader a ban revoked -- `GET /admin/readers/revoked`. `emailHash` is
    the value of an `email` ban key, for finding the key bans that outlive
    a restore. `updatedAt` is when the row last changed: the revocation,
    unless something touched the reader since. */
export interface AdminBannedReader {
  readerId: string;
  emailHash: string;
  email: string;
  displayName: string | null;
  updatedAt: string;
}

export interface AdminBannedReaderListResult {
  readers: AdminBannedReader[];
}

/** POST /admin/readers/:readerId/restore. */
export interface AdminReaderRestoreResult {
  readerId: string;
  restoredAt: string;
}

/** Everything about one key in one response --
    `GET /admin/sources/:type/:value`. */
export interface AdminSourceAddress {
  emailHash: string;
  /** Plaintext while a row still holds it. */
  email: string | null;
  confirmed: boolean;
  comments: number;
  messages: number;
  lastSeenAt: string;
}

export interface AdminSourceDevice {
  clientFp: string;
  browser: string | null;
  os: string | null;
  comments: number;
  reactions: number;
  messages: number;
  lastSeenAt: string;
}

export interface AdminSourceProfile {
  key: { type: AdminSourceKeyType; value: string };
  identitySummary?: {
    verifiedAccounts: number;
    anonymousSessions: number;
    claimedComments: number;
    sharedStorage: boolean;
    sharedFingerprint: boolean;
  };
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  comments: {
    total: number;
    byStatus: Record<AdminCommentStatus, number>;
    /** Newest 50. */
    rows: AdminCommentRecord[];
  };
  reactions: {
    total: number;
    byTarget: Array<{ targetType: 'post' | 'comment'; targetId: string; postTitle: string | null; count: number }>;
    /** Newest 50. */
    rows: AdminReactionRecord[];
  };
  /** Distinct observed values. Shared environments do not establish a person. */
  spread: Record<
    'session' | 'ip' | 'ip24' | 'fp' | 'clientFp' | 'clientFpStable' | 'storageId' | 'email' | 'asn' | 'ua',
    number
  >;
  /** Every bot and vpn hint this source has tripped, with how often. */
  hints: Array<{ hint: string; kind: 'bot' | 'vpn'; count: number }>;
  /** Links describe verified-at-write account evidence or shared storage.
      clientFpStable remains zero for compatibility; it never creates links. */
  linked: {
    sessions: number;
    via: Record<'email' | 'clientFpStable' | 'storageId', number>;
    carried: Record<'ip24' | 'clientFpStable' | 'email' | 'storageId', number>;
    comments: number;
    held: number;
    reactions: number;
  };
  /** Owner messages under this key. Absent from a site-api that predates it. */
  messages?: {
    total: number;
    byState: Record<MessageState, number>;
    /** Newest 50. */
    rows: AdminOwnerMessage[];
  };
  /** Addresses written under this key, newest first, at most 10. `confirmed`
      means a signed-in reader wrote with it; a typed address is evidence of
      what this key claimed, never a link to that reader. */
  addresses?: AdminSourceAddress[];
  /** Device fingerprints seen under this key, newest first, at most 10. */
  devices?: AdminSourceDevice[];
  /** Writes per hour over the source's last 7 days. */
  hourly: Array<{ hour: string; comments: number; reactions: number }>;
  behaviour: {
    dwellMsMedian: number | null;
    turnstileAgeMsMedian: number | null;
    /** 0..1 */
    newSessionShare: number;
    authMix: Record<'turnstile' | 'pass' | 'verified', number>;
  };
  bans: AdminBan[];
}

/** One grouped row in an insights table. `held` and `heldRate` (0..1) are
    null on the reaction tables, where nothing is held. */
export interface AdminInsightRow {
  count: number;
  held: number | null;
  heldRate: number | null;
  /** Distinct sessions behind the count. */
  sessions: number;
}

export type AdminCommentInsightsWindow = '7d' | '30d' | '90d';
export type AdminReactionInsightsWindow = '48h' | '7d';

export interface AdminCommentQuality {
  since: string;
  collectedSince: string | null;
  available: { moderation: boolean; requests: boolean; clientReports: boolean };
  /** A cohort of automatically held comments and the first later owner decision. */
  moderation: { held: number; reviewed: number; released: number; releasedShare: number | null };
  /** Request outcomes include retries. Authenticated does not mean known benign. */
  requests: {
    attempts: number;
    failures: number;
    failureShare: number | null;
    authenticatedAttempts: number;
    authenticatedFailures: number;
    authenticatedFailureShare: number | null;
    outcomes: Array<{ kind: 'comment' | 'reaction'; outcome: string; count: number }>;
  };
  /** Self-reported and incomplete when the browser cannot deliver telemetry. */
  clientReports: {
    reports: number;
    failures: number;
    networkFailures: number;
    challengedAttempts: number;
    repeatedChallenges: number;
    untrusted: true;
  };
}

/** `GET /admin/comments/insights?window=`. Every table carries a held rate,
    because a source is only interesting relative to how the automatic pass
    treats it. NULL groups show as their own row, never dropped. */
export interface AdminCommentInsights {
  window: AdminCommentInsightsWindow;
  since: string;
  quality?: AdminCommentQuality;
  networks: Array<AdminInsightRow & { asn: number | null; asOrg: string | null }>;
  countries: Array<AdminInsightRow & { country: string | null }>;
  subnets: Array<AdminInsightRow & { ip24: string | null; sampleIp: string | null }>;
  browsers: Array<AdminInsightRow & { browser: string | null; os: string | null }>;
  devices: Array<AdminInsightRow & {
    clientFp: string | null;
    renderer: string | null;
    screen: string | null;
    platform: string | null;
    subnets: number;
  }>;
  botHints: Array<{ hint: string; count: number; held: number; heldRate: number }>;
  vpnHints: Array<{ hint: string; count: number; held: number; heldRate: number }>;
  linkDomains: Array<AdminInsightRow & { domain: string; banned: boolean }>;
  duplicates: Array<AdminInsightRow & { bodyHash: string; sample: string }>;
  emailDomains: Array<AdminInsightRow & { domain: string; mxShare: number | null; banned: boolean }>;
  tlsStacks: Array<{ browser: string | null; ciphersSha1: string | null; count: number; held: number; heldRate: number }>;
  typing: Array<{ bucket: string; count: number; held: number; heldRate: number }>;
  dailyByStatus: Array<{ day: string; published: number; held: number; rejected: number; deleted: number }>;
  dwell: Array<{ bucket: string; count: number; held: number; heldRate: number }>;
  sessionAge: Array<{ day: string; writes: number; newShare: number }>;
  email: Array<{ kind: 'without' | 'verified' | 'unverified' | 'disposable'; count: number; held: number; heldRate: number }>;
  overturns: Array<{ week: string; falsePositives: number; falseNegatives: number }>;
  banHits: Array<{ keyType: AdminBanKeyType; keyValue: string; note: string | null; hits: number }>;
}

/** `GET /admin/reactions/insights?window=`. */
export interface AdminReactionInsights {
  window: AdminReactionInsightsWindow;
  since: string;
  hourly: Array<{ hour: string; reactions: number; sessions: number; subnets: number }>;
  authMix: Array<{ day: string; turnstile: number; pass: number; verified: number }>;
  targets: Array<{
    targetType: 'post' | 'comment';
    targetId: string;
    postTitle: string | null;
    reactions: number;
    subnets: number;
    fps: number;
  }>;
  networks: Array<AdminInsightRow & { asn: number | null; asOrg: string | null }>;
  countries: Array<AdminInsightRow & { country: string | null }>;
  subnets: Array<AdminInsightRow & { ip24: string | null; sampleIp: string | null }>;
  browsers: Array<AdminInsightRow & { browser: string | null; os: string | null }>;
  devices: Array<AdminInsightRow & {
    clientFp: string | null;
    renderer: string | null;
    screen: string | null;
    platform: string | null;
    subnets: number;
  }>;
  botHints: Array<{ hint: string; count: number }>;
  tlsStacks: Array<{ browser: string | null; ciphersSha1: string | null; count: number }>;
  sessionAge: Array<{ day: string; writes: number; newShare: number }>;
  timeToTap: Array<{ bucket: string; count: number; sessions: number }>;
}

// ---------------------------------------------------------------------------
//
// The comment and reaction activity log (GET /admin/activity).

/** Reject and restore are logged as `comment.moderate`, with the status
    they left the row in. */
export const ADMIN_ACTIVITY_EVENTS = [
  'comment.create',
  'comment.edit',
  'comment.remove',
  'comment.moderate',
  'comment.approve',
  'comment.hide',
  'comment.delete',
  'reaction.add',
  'reaction.remove',
] as const;
export type AdminActivityEvent = (typeof ADMIN_ACTIVITY_EVENTS)[number];
export type AdminActivityActor = 'reader' | 'model' | 'owner';
export type AdminActivitySource = 'web' | 'portal' | 'telegram' | 'cron';
export type AdminActivityTargetType = 'comment' | 'post';
export type AdminActivityFamily = 'comments' | 'reactions';

export interface AdminActivityRecord {
  id: string;
  createdAt: string;
  event: AdminActivityEvent;
  actor: AdminActivityActor;
  source: AdminActivitySource;
  targetType: AdminActivityTargetType;
  targetId: string;
  postId: string | null;
  postTitle: string | null;
  postSlug: string | null;
  displayName: string | null;
  readerId: string | null;
  anonymous: boolean;
  emoji: string | null;
  status: string | null;
  reason: string | null;
  note: string | null;
}

export interface AdminActivitySummary {
  byEvent: Record<AdminActivityEvent, number>;
  today: number;
  reactionsNet: number;
  daily: Array<{ date: string; comments: number; reactions: number }>;
}

export interface AdminActivityListResult {
  summary: AdminActivitySummary;
  entries: AdminActivityRecord[];
  total: number;
  nextOffset: number | null;
}
