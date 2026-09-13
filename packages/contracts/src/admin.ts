import type { ClientFingerprint, CommentStatus, Interaction } from './comments';
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
  /** Filled from the post registry; null when it could not say. */
  postTitle: string | null;
  postSlug: string | null;
  actor: AdminCommentActor;
}

/** One page of the moderation queue. */
export interface AdminCommentListResult {
  comments: AdminCommentRecord[];
  /** Rows matching the filter, ignoring the page window. */
  total: number;
  /** `offset + comments.length`, or null on the last page. */
  nextOffset: number | null;
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
}

/** Where a row came from, as far as the write path could tell. Shared by
    comments and reactions; a reaction's block has no email, no link domains
    and no body hash. */
export interface AdminCommentActor {
  readerId: string | null;
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
  revokeReaderId?: string | null;
}

export interface AdminBanResult {
  bans: AdminBan[];
  purged: { comments: number; reactions: number };
}

export interface AdminBanListResult {
  bans: AdminBan[];
}

/** Everything about one key in one response --
    `GET /admin/sources/:type/:value`. */
export interface AdminSourceProfile {
  key: { type: AdminSourceKeyType; value: string };
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
  /** Distinct values of every other key this source has used. The spread is
      the churn: one fingerprint over 40 sessions and 12 IPs is a bot; one
      session over 3 IPs is a phone that changed networks. */
  spread: Record<
    'session' | 'ip' | 'ip24' | 'fp' | 'clientFp' | 'clientFpStable' | 'storageId' | 'email' | 'asn' | 'ua',
    number
  >;
  /** Every bot and vpn hint this source has tripped, with how often. */
  hints: Array<{ hint: string; kind: 'bot' | 'vpn'; count: number }>;
  /** Two hops over strong keys only (session, email, clientFpStable,
      storageId): the sessions this source links to, and what those sessions
      carried. Never `ip24`, `asn` or `ua` as a hop. */
  linked: {
    sessions: number;
    via: Record<'email' | 'clientFpStable' | 'storageId', number>;
    carried: Record<'ip24' | 'clientFpStable' | 'email' | 'storageId', number>;
    comments: number;
    held: number;
    reactions: number;
  };
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

/** `GET /admin/comments/insights?window=`. Every table carries a held rate,
    because a source is only interesting relative to how the automatic pass
    treats it. NULL groups show as their own row, never dropped. */
export interface AdminCommentInsights {
  window: AdminCommentInsightsWindow;
  since: string;
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
