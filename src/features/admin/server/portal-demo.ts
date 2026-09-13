import type {
  AdminBan,
  AdminBanKeyType,
  AdminBanListResult,
  AdminClusterCount,
  AdminClusterKey,
  AdminCommentActor,
  AdminCommentInsights,
  AdminReactionInsights,
  AdminReactionListResult,
  AdminReactionRecord,
  AdminSourceKeyType,
  AdminSourceProfile,
} from '@bunizao/contracts';
import type { PortalActivity, PortalComments, PortalOverview } from './portal-client';

// Local-dev fixture. When the site-api service binding is unavailable (running
// `bun dev` without `bun dev:api`), the overview would otherwise render all
// zeros and a red error banner — useless for design work. The page swaps in
// this fixture behind `import.meta.env.DEV`, so it never reaches production.
const now = Date.now();
const minsAgo = (m: number): string => new Date(now - m * 60_000).toISOString();
const hoursAgo = (h: number): string => new Date(now - h * 3_600_000).toISOString();

export const DEMO_OVERVIEW: PortalOverview = {
  subscriberStats: {
    total: 1284,
    activeCount: 1147,
    pendingCount: 38,
    unsubscribedCount: 99,
  },
  auditEvents: [
    { id: 812, eventType: 'subscription_confirmed', email: 'lena.ortiz@fastmail.com', emailHash: 'd1', source: 'web', createdAt: minsAgo(4) },
    { id: 811, eventType: 'subscribe_requested', email: 'devon@hey.com', emailHash: 'd2', source: 'web', createdAt: minsAgo(21) },
    { id: 810, eventType: 'broadcast_sent', email: 'system', emailHash: 'd3', source: 'admin', createdAt: minsAgo(55) },
    { id: 809, eventType: 'unsubscribed', email: 'm.tanaka@gmail.com', emailHash: 'd4', source: 'link', createdAt: hoursAgo(3) },
    { id: 808, eventType: 'admin_update', email: 'priya@outlook.com', emailHash: 'd5', source: 'admin', createdAt: hoursAgo(6) },
    { id: 807, eventType: 'subscription_confirmed', email: 'noah.kim@proton.me', emailHash: 'd6', source: 'web', createdAt: hoursAgo(9) },
  ],
  broadcasts: [
    { id: 'bc_0f2a', subject: 'July dispatch — new writing and a mood recap', bodyHtml: '', bodyText: null, audience: { status: 'active', channels: ['announcement'] }, recipientCount: 1147, sentCount: 1147, failedCount: 0, status: 'sent', createdAt: hoursAgo(1), sentAt: minsAgo(55), sentBy: 'admin' },
    { id: 'bc_0e91', subject: 'A quiet note about what I shipped this month', bodyHtml: '', bodyText: null, audience: { status: 'active', channels: ['blog'] }, recipientCount: 1103, sentCount: 1098, failedCount: 5, status: 'sent', createdAt: hoursAgo(74), sentAt: hoursAgo(72), sentBy: 'admin' },
    { id: 'bc_0d77', subject: 'Privacy policy update', bodyHtml: '', bodyText: null, audience: { status: 'active', channels: ['privacy'] }, recipientCount: 1284, sentCount: 1284, failedCount: 0, status: 'sent', createdAt: hoursAgo(220), sentAt: hoursAgo(218), sentBy: 'admin' },
  ],
};

/* The comment queue's fixture. Written to look like a real day rather than a
   clean one: two held rows the model disagreed about, one of them a link-spam
   ad that is obviously right to hold and one a blunt-but-fine comment that is
   obviously wrong to, because a queue design that only ever shows correct
   verdicts hides the thing the queue is for. */
const daysAgo = (d: number): string => new Date(now - d * 86_400_000).toISOString();

const NO_CLUSTER: AdminClusterCount = { comments: 0, held: 0, reactions: 0 };
const CLUSTER_KEYS: AdminClusterKey[] = [
  'session', 'ip', 'ip24', 'fp', 'email', 'clientFp', 'clientFpStable', 'storageId', 'emailDomain', 'bodyHash',
];

/* A demo actor. Only the fields the strip actually prints are filled: the
   fixture exists so the layout can be designed against something, not so it
   can pretend to be a capture. `detail` and `client` stay null on two of the
   three rows, which is also what a swept row looks like. */
function demoActor(overrides: Partial<Omit<AdminCommentActor, 'cluster' | 'keys'>> & {
  cluster?: Partial<Record<AdminClusterKey, AdminClusterCount>>;
  keys?: Partial<AdminCommentActor['keys']>;
} = {}): AdminCommentActor {
  const cluster = Object.fromEntries(
    CLUSTER_KEYS.map((key) => [key, overrides.cluster?.[key] ?? NO_CLUSTER]),
  ) as Record<AdminClusterKey, AdminClusterCount>;
  return {
    readerId: null,
    email: null,
    emailDomainPublishedComments: 0,
    ip: '203.0.113.7',
    ua: null,
    browser: 'Chrome 128',
    os: 'Windows',
    country: 'AU',
    city: 'Melbourne',
    asn: 4764,
    asOrg: 'Aussie Broadband',
    sessionNew: false,
    botHints: 0,
    detail: null,
    client: null,
    behaviour: { dwellMs: 42_000, turnstileAgeMs: 900, linkCount: 0, emailMx: null, emailGravatar: null },
    ...overrides,
    keys: {
      session: 'se55i0n0',
      ip: 'a1b2c3d4',
      ip24: 'e5f60718',
      fp: '29a3bb01',
      email: null,
      clientFp: null,
      clientFpStable: null,
      storageId: null,
      emailDomain: null,
      bodyHash: '7f10aa92',
      linkDomains: [],
      ...overrides.keys,
    },
    banned: overrides.banned ?? ([] as AdminBanKeyType[]),
    cluster,
    domainCluster: overrides.domainCluster ?? [],
  };
}

export const DEMO_COMMENTS: PortalComments = {
  summary: {
    byStatus: { held: 3, published: 148, rejected: 11, deleted: 4 },
    today: 6,
    oldestHeldAt: hoursAgo(31),
    reasons: [
      { reason: 'spam', count: 8 },
      { reason: 'promotional', count: 4 },
      { reason: 'abuse', count: 2 },
    ],
    topPosts: [
      { postId: '665f0a11', count: 34, title: 'The retry budget nobody wrote down', slug: 'retry-budget' },
      { postId: '661c48d2', count: 21, title: 'One abstraction fewer', slug: 'one-abstraction-fewer' },
      { postId: '6708be93', count: 12, title: 'Shipping on a Friday, on purpose', slug: 'shipping-on-friday' },
    ],
    daily: Array.from({ length: 14 }, (_, index) => ({
      date: daysAgo(13 - index).slice(0, 10),
      count: [0, 2, 1, 0, 4, 3, 1, 0, 0, 5, 2, 7, 3, 6][index],
    })),
  },
  comments: [
    {
      id: '01J8QK3M7X',
      postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down',
      postSlug: 'retry-budget',
      parentId: null,
      author: 'seo-growth-hub',
      verified: false,
      body: 'Great insights! We help developers 10x their traffic — book a free audit at https://growth-hub.example/audit and mention this post for 30% off.',
      status: 'held',
      moderationAction: 'hold',
      moderationReason: 'promotional',
      moderationNote: 'Unsolicited service pitch with an outbound offer link.',
      moderationModel: 'akismet',
      country: 'SG',
      createdAt: hoursAgo(31),
      editedAt: null,
      actor: demoActor({
        authAtWrite: 'anonymous',
        ip: '198.51.100.24',
        country: 'SG',
        city: 'Singapore',
        asn: 14061,
        asOrg: 'DigitalOcean',
        sessionNew: true,
        botHints: 3,
        behaviour: { dwellMs: 1_400, turnstileAgeMs: 400, linkCount: 2, emailMx: false, emailGravatar: false },
        keys: {
          session: 'aa01bb02', ip: 'c0ffee01', ip24: 'c0ffee02', fp: 'deadbeef',
          email: 'e1e1e1e1', clientFp: 'f00dcafe', clientFpStable: 'f00dcaf0', storageId: null,
          emailDomain: 'growth-hub.example', bodyHash: 'b0b0b0b0',
          linkDomains: ['growth-hub.example'],
        },
        cluster: {
          ip24: { comments: 6, held: 6, reactions: 2 },
          clientFpStable: { comments: 4, held: 4, reactions: 0 },
        },
        domainCluster: [{ domain: 'growth-hub.example', comments: 6, held: 6, banned: false }],
      }),
    },
    {
      id: '01J8QM0P4A',
      postId: '661c48d2',
      postTitle: 'One abstraction fewer',
      postSlug: 'one-abstraction-fewer',
      parentId: null,
      author: '老陈',
      verified: true,
      body: '说实话这篇的结论我不太同意。删掉一层抽象确实少了一处要读的代码，但你把它换成了三个地方各自的特判，维护成本是转移了不是消失了。',
      status: 'held',
      moderationAction: 'hold',
      moderationReason: 'abuse',
      moderationNote: 'Direct disagreement with the author; no personal attack found.',
      moderationModel: 'akismet',
      country: 'CN',
      createdAt: hoursAgo(6),
      editedAt: null,
      actor: demoActor({
        authAtWrite: 'verified',
        readerId: 'reader-chen',
        ip: '203.0.113.91',
        country: 'CN',
        city: 'Shanghai',
        asn: 4134,
        asOrg: 'China Telecom',
        email: 'chen@example.com',
        behaviour: { dwellMs: 186_000, turnstileAgeMs: 2_100, linkCount: 0, emailMx: true, emailGravatar: true },
        keys: {
          session: '11aa22bb', ip: '33cc44dd', ip24: '55ee66ff', fp: '77aa88bb',
          email: '99cc00dd', clientFp: null, clientFpStable: null, storageId: null,
          emailDomain: 'example.com', bodyHash: 'a1a2a3a4', linkDomains: [],
        },
      }),
    },
    {
      id: '01J8QN9R2C',
      postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down',
      postSlug: 'retry-budget',
      parentId: '01J8QK1A00',
      author: 'Wren',
      verified: true,
      body: 'Same experience here — the retry budget was the part nobody had written down.',
      status: 'held',
      moderationAction: 'hold',
      moderationReason: null,
      moderationNote: 'Model timed out; held by the fail-closed default.',
      moderationModel: null,
      country: 'AU',
      createdAt: minsAgo(38),
      editedAt: null,
      actor: demoActor({
        authAtWrite: 'anonymous',
        readerId: 'reader-wren',
        claimedAt: minsAgo(20),
        claimMethod: 'session',
        cluster: { session: { comments: 2, held: 0, reactions: 5 } },
      }),
    },
  ],
  total: 3,
  nextOffset: null,
};

/* The activity feed's fixture. Written as one plausible afternoon rather than
   a tidy sample: a comment that was held, then approved, and a reader who
   added a reaction and took it back twenty minutes later. Those two sequences
   are the whole reason this page exists, and a fixture that never shows them
   makes the design look pointless. */
export const DEMO_ACTIVITY: PortalActivity = {
  summary: {
    byEvent: {
      'comment.create': 166,
      'comment.edit': 12,
      'comment.remove': 5,
      'comment.moderate': 41,
      'comment.approve': 27,
      'comment.hide': 6,
      'comment.delete': 4,
      'reaction.add': 512,
      'reaction.remove': 63,
    },
    today: 19,
    reactionsNet: 449,
    daily: Array.from({ length: 14 }, (_, index) => ({
      date: daysAgo(13 - index).slice(0, 10),
      comments: [0, 2, 1, 0, 4, 3, 1, 0, 0, 5, 2, 7, 3, 6][index],
      reactions: [3, 9, 4, 2, 14, 11, 6, 1, 2, 22, 8, 31, 12, 19][index],
    })),
  },
  entries: [
    {
      id: 'ac_01', createdAt: minsAgo(3), event: 'reaction.add', actor: 'reader', source: 'web',
      targetType: 'post', targetId: '665f0a11', postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down', postSlug: 'retry-budget',
      displayName: null, readerId: null, anonymous: true,
      emoji: '❤️', status: null, reason: null, note: null,
    },
    {
      id: 'ac_02', createdAt: minsAgo(9), event: 'comment.approve', actor: 'owner', source: 'telegram',
      targetType: 'comment', targetId: '01J8QK3M7X', postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down', postSlug: 'retry-budget',
      displayName: 'Ines', readerId: 'rd_9f21', anonymous: false,
      emoji: null, status: 'published', reason: 'ok', note: 'Approved by the owner from Telegram.',
    },
    {
      id: 'ac_03', createdAt: minsAgo(24), event: 'reaction.remove', actor: 'reader', source: 'web',
      targetType: 'comment', targetId: '01J8QK3M7X', postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down', postSlug: 'retry-budget',
      displayName: 'Ines', readerId: 'rd_9f21', anonymous: false,
      emoji: '❤️', status: null, reason: null, note: null,
    },
    {
      id: 'ac_04', createdAt: minsAgo(44), event: 'reaction.add', actor: 'reader', source: 'web',
      targetType: 'comment', targetId: '01J8QK3M7X', postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down', postSlug: 'retry-budget',
      displayName: 'Ines', readerId: 'rd_9f21', anonymous: false,
      emoji: '❤️', status: null, reason: null, note: null,
    },
    {
      id: 'ac_05', createdAt: hoursAgo(2), event: 'comment.moderate', actor: 'model', source: 'web',
      targetType: 'comment', targetId: '01J8QK3M7X', postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down', postSlug: 'retry-budget',
      displayName: 'Ines', readerId: 'rd_9f21', anonymous: false,
      emoji: null, status: 'held', reason: 'off_topic',
      note: 'Held for review: the model was not confident either way.',
    },
    {
      id: 'ac_06', createdAt: hoursAgo(2), event: 'comment.create', actor: 'reader', source: 'web',
      targetType: 'comment', targetId: '01J8QK3M7X', postId: '665f0a11',
      postTitle: 'The retry budget nobody wrote down', postSlug: 'retry-budget',
      displayName: 'Ines', readerId: 'rd_9f21', anonymous: false,
      emoji: null, status: 'held', reason: null, note: null,
    },
  ],
  total: 6,
  nextOffset: null,
};

/* The three surfaces the queue's fixture does not cover: reactions, the two
   insight pages, the ban list and one source profile. Same reason as above --
   without these, `bun dev` renders four red error banners and the layouts
   cannot be looked at. The numbers are written to tell one story across all
   of them: a rented /24 in Singapore taps hearts all night and posts audit
   spam, and an ordinary Melbourne readership does neither. */

const HOSTING_ACTOR = demoActor({
  ip: '198.51.100.24',
  country: 'SG',
  city: 'Singapore',
  asn: 14061,
  asOrg: 'DigitalOcean',
  sessionNew: true,
  botHints: 3,
  keys: {
    session: 'aa01bb02',
    ip: 'c0ffee01',
    ip24: 'c0ffee02',
    fp: 'deadbeef',
    clientFp: 'f00dcafe',
    clientFpStable: 'f00dcaf0',
  },
  cluster: {
    ip24: { comments: 6, held: 6, reactions: 2 },
    clientFpStable: { comments: 4, held: 4, reactions: 0 },
  },
});

const READER_ACTOR = demoActor({
  ip: '203.0.113.91',
  country: 'AU',
  city: 'Melbourne',
  keys: { session: '11aa22bb', ip: '33cc44dd', ip24: '55ee66ff', fp: '77aa88bb' },
});

const reaction = (
  id: string,
  createdAt: string,
  actor: AdminCommentActor,
  over: Partial<AdminReactionRecord> = {},
): AdminReactionRecord => ({
  id,
  targetType: 'post',
  targetId: '665f0a11',
  postId: '665f0a11',
  postTitle: 'The retry budget nobody wrote down',
  postSlug: 'retry-budget',
  emoji: '❤️',
  createdAt,
  actor,
  ...over,
});

export const DEMO_REACTIONS: AdminReactionListResult = {
  reactions: [
    reaction('01J8QR0001', minsAgo(3), HOSTING_ACTOR),
    reaction('01J8QR0002', minsAgo(4), HOSTING_ACTOR),
    reaction('01J8QR0003', minsAgo(6), HOSTING_ACTOR),
    reaction('01J8QR0004', minsAgo(38), READER_ACTOR, {
      targetType: 'comment',
      targetId: '01J8QK3M7Z',
      postTitle: 'One abstraction fewer',
      postSlug: 'one-abstraction-fewer',
      postId: '661c48d2',
    }),
    reaction('01J8QR0005', hoursAgo(5), READER_ACTOR, {
      targetId: '661c48d2',
      postId: '661c48d2',
      postTitle: 'One abstraction fewer',
      postSlug: 'one-abstraction-fewer',
    }),
  ],
  total: 5,
  nextOffset: null,
};

export const DEMO_BANS: AdminBanListResult = {
  bans: [
    { keyType: 'ip24', keyValue: 'c0ffee02', note: 'Audit-spam /24, rented', source: 'portal', createdAt: daysAgo(2), expiresAt: null, hits: 41 },
    { keyType: 'domain', keyValue: 'growth-hub.example', note: 'Outbound offer link', source: 'portal', createdAt: daysAgo(2), expiresAt: null, hits: 22 },
    { keyType: 'client_fp', keyValue: 'f00dcaf0', note: null, source: 'portal', createdAt: daysAgo(9), expiresAt: daysAgo(-21), hits: 7 },
    { keyType: 'email_domain', keyValue: 'mailinator.example', note: 'Disposable', source: 'telegram', createdAt: daysAgo(26), expiresAt: null, hits: 3 },
    { keyType: 'session', keyValue: 'aa01bb02', note: null, source: 'portal', createdAt: hoursAgo(20), expiresAt: null, hits: 0 },
  ],
};

/* `held` is null on every reaction table -- a heart is recorded or it is not,
    so there is nothing for the automatic pass to hold. The contract says so;
    this helper has to say so too. */
const row = (count: number, held: number | null, sessions: number) => ({
  count,
  held,
  heldRate: held === null ? null : (count === 0 ? 0 : held / count),
  sessions,
});

export const DEMO_COMMENT_INSIGHTS: AdminCommentInsights = {
  window: '30d',
  since: daysAgo(30),
  networks: [
    { ...row(214, 3, 186), asn: 4764, asOrg: 'Aussie Broadband' },
    { ...row(64, 61, 4), asn: 14061, asOrg: 'DigitalOcean' },
    { ...row(31, 2, 29), asn: 4134, asOrg: 'China Telecom' },
    { ...row(9, 1, 9), asn: null, asOrg: null },
  ],
  countries: [
    { ...row(198, 4, 171), country: 'AU' },
    { ...row(66, 61, 6), country: 'SG' },
    { ...row(40, 2, 37), country: 'CN' },
    { ...row(14, 0, 14), country: null },
  ],
  subnets: [
    { ...row(61, 60, 3), ip24: 'c0ffee02', sampleIp: '198.51.100.24' },
    { ...row(28, 0, 22), ip24: '55ee66ff', sampleIp: '203.0.113.91' },
    { ...row(11, 1, 11), ip24: null, sampleIp: null },
  ],
  browsers: [
    { ...row(180, 8, 160), browser: 'Chrome 128', os: 'Windows' },
    { ...row(92, 3, 84), browser: 'Safari 18', os: 'macOS' },
    { ...row(46, 44, 3), browser: 'Chrome 128', os: 'Linux' },
    { ...row(7, 0, 7), browser: null, os: null },
  ],
  devices: [
    { ...row(44, 43, 3), clientFp: 'f00dcafe', renderer: 'SwiftShader', screen: '1280x1024', platform: 'Linux x86_64', subnets: 9 },
    { ...row(23, 0, 2), clientFp: 'ab77cd12', renderer: 'Apple M3', screen: '1728x1117', platform: 'MacIntel', subnets: 2 },
    { ...row(12, 1, 12), clientFp: null, renderer: null, screen: null, platform: null, subnets: 11 },
  ],
  botHints: [
    { hint: 'no_input_events', count: 48, held: 46, heldRate: 46 / 48 },
    { hint: 'instant_compose', count: 44, held: 43, heldRate: 43 / 44 },
    { hint: 'webdriver', count: 12, held: 12, heldRate: 1 },
    { hint: 'headless_ua', count: 5, held: 5, heldRate: 1 },
  ],
  vpnHints: [
    { hint: 'hosting_asn', count: 66, held: 61, heldRate: 61 / 66 },
    { hint: 'timezone_mismatch', count: 23, held: 9, heldRate: 9 / 23 },
  ],
  linkDomains: [
    { ...row(22, 22, 3), domain: 'growth-hub.example', banned: true },
    { ...row(9, 7, 4), domain: 'seo-boost.example', banned: false },
    { ...row(6, 0, 6), domain: 'github.com', banned: false },
  ],
  duplicates: [
    { ...row(14, 14, 3), bodyHash: 'b0b0b0b0', sample: 'Great insights! We help developers 10x their traffic — book a free audit at…' },
    { ...row(3, 0, 3), bodyHash: '9911aa22', sample: '谢谢分享' },
  ],
  emailDomains: [
    { ...row(88, 2, 80), domain: 'gmail.com', mxShare: 1, banned: false },
    { ...row(31, 1, 30), domain: 'qq.com', mxShare: 1, banned: false },
    { ...row(12, 12, 2), domain: 'mailinator.example', mxShare: 0, banned: true },
    { ...row(4, 2, 4), domain: 'nope.example', mxShare: null, banned: false },
  ],
  tlsStacks: [
    { browser: 'Chrome 128', ciphersSha1: 'JZtiTn8H', count: 180, held: 8, heldRate: 8 / 180 },
    { browser: 'Chrome 128', ciphersSha1: 'QQ91xz02', count: 46, held: 44, heldRate: 44 / 46 },
    { browser: null, ciphersSha1: null, count: 9, held: 1, heldRate: 1 / 9 },
  ],
  typing: [
    { bucket: 'no keystrokes', count: 48, held: 46, heldRate: 46 / 48 },
    { bucket: 'cv < 100‰', count: 21, held: 18, heldRate: 18 / 21 },
    { bucket: 'cv 100–400‰', count: 164, held: 3, heldRate: 3 / 164 },
    { bucket: 'cv > 400‰', count: 85, held: 2, heldRate: 2 / 85 },
  ],
  dailyByStatus: Array.from({ length: 14 }, (_, index) => ({
    day: daysAgo(13 - index).slice(0, 10),
    published: [6, 9, 7, 5, 11, 8, 6, 4, 7, 12, 9, 14, 8, 10][index],
    held: [0, 1, 0, 0, 2, 1, 0, 0, 0, 9, 14, 21, 6, 3][index],
    rejected: [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 2, 3, 1, 0][index],
    deleted: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 4, 0, 0][index],
  })),
  dwell: [
    { bucket: '< 3s', count: 12, held: 12, heldRate: 1 },
    { bucket: '3–10s', count: 39, held: 31, heldRate: 31 / 39 },
    { bucket: '10–60s', count: 148, held: 5, heldRate: 5 / 148 },
    { bucket: '> 60s', count: 119, held: 2, heldRate: 2 / 119 },
  ],
  sessionAge: Array.from({ length: 14 }, (_, index) => ({
    day: daysAgo(13 - index).slice(0, 10),
    writes: [6, 10, 8, 5, 14, 9, 6, 4, 7, 22, 25, 38, 15, 13][index],
    newShare: [0.2, 0.3, 0.2, 0.4, 0.3, 0.2, 0.3, 0.5, 0.3, 0.8, 0.9, 0.95, 0.6, 0.3][index],
  })),
  email: [
    { kind: 'without', count: 121, held: 38, heldRate: 38 / 121 },
    { kind: 'verified', count: 96, held: 1, heldRate: 1 / 96 },
    { kind: 'unverified', count: 89, held: 19, heldRate: 19 / 89 },
    { kind: 'disposable', count: 12, held: 12, heldRate: 1 },
  ],
  overturns: [
    { week: daysAgo(21).slice(0, 10), falsePositives: 2, falseNegatives: 0 },
    { week: daysAgo(14).slice(0, 10), falsePositives: 1, falseNegatives: 1 },
    { week: daysAgo(7).slice(0, 10), falsePositives: 3, falseNegatives: 0 },
  ],
  banHits: [
    { keyType: 'ip24', keyValue: 'c0ffee02', note: 'Audit-spam /24, rented', hits: 41 },
    { keyType: 'domain', keyValue: 'growth-hub.example', note: 'Outbound offer link', hits: 22 },
    { keyType: 'client_fp', keyValue: 'f00dcaf0', note: null, hits: 7 },
  ],
};

export const DEMO_REACTION_INSIGHTS: AdminReactionInsights = {
  window: '7d',
  since: daysAgo(7),
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    hour: `${daysAgo(0).slice(0, 10)}T${String(hour).padStart(2, '0')}`,
    reactions: hour >= 2 && hour <= 5 ? 180 + hour * 7 : 4 + (hour % 5),
    sessions: hour >= 2 && hour <= 5 ? 3 : 4 + (hour % 5),
    subnets: hour >= 2 && hour <= 5 ? 1 : 3 + (hour % 4),
  })),
  authMix: Array.from({ length: 7 }, (_, index) => ({
    day: daysAgo(6 - index).slice(0, 10),
    turnstile: [12, 9, 14, 11, 18, 320, 22][index],
    pass: [41, 38, 44, 39, 52, 47, 50][index],
    verified: [8, 6, 9, 7, 11, 10, 12][index],
  })),
  targets: [
    { targetType: 'post', targetId: '665f0a11', postTitle: 'The retry budget nobody wrote down', reactions: 341, subnets: 2, fps: 3 },
    { targetType: 'post', targetId: '661c48d2', postTitle: 'One abstraction fewer', reactions: 64, subnets: 51, fps: 58 },
    { targetType: 'comment', targetId: '01J8QK3M7Z', postTitle: 'One abstraction fewer', reactions: 12, subnets: 12, fps: 12 },
  ],
  networks: [
    { ...row(318, null, 3), asn: 14061, asOrg: 'DigitalOcean' },
    { ...row(96, null, 88), asn: 4764, asOrg: 'Aussie Broadband' },
    { ...row(11, null, 11), asn: null, asOrg: null },
  ],
  countries: [
    { ...row(320, null, 5), country: 'SG' },
    { ...row(104, null, 96), country: 'AU' },
    { ...row(9, null, 9), country: null },
  ],
  subnets: [
    { ...row(316, null, 3), ip24: 'c0ffee02', sampleIp: '198.51.100.24' },
    { ...row(42, null, 40), ip24: '55ee66ff', sampleIp: '203.0.113.91' },
  ],
  browsers: [
    { ...row(318, null, 3), browser: 'Chrome 128', os: 'Linux' },
    { ...row(97, null, 90), browser: 'Safari 18', os: 'macOS' },
  ],
  devices: [
    { ...row(312, null, 3), clientFp: 'f00dcafe', renderer: 'SwiftShader', screen: '1280x1024', platform: 'Linux x86_64', subnets: 1 },
    { ...row(58, null, 55), clientFp: 'ab77cd12', renderer: 'Apple M3', screen: '1728x1117', platform: 'MacIntel', subnets: 39 },
  ],
  botHints: [
    { hint: 'no_input_events', count: 308 },
    { hint: 'instant_tap', count: 291 },
    { hint: 'webdriver', count: 24 },
  ],
  tlsStacks: [
    { browser: 'Chrome 128', ciphersSha1: 'QQ91xz02', count: 316 },
    { browser: 'Safari 18', ciphersSha1: 'JZtiTn8H', count: 97 },
  ],
  sessionAge: Array.from({ length: 7 }, (_, index) => ({
    day: daysAgo(6 - index).slice(0, 10),
    writes: [61, 55, 67, 58, 81, 377, 84][index],
    newShare: [0.2, 0.2, 0.3, 0.2, 0.3, 0.97, 0.3][index],
  })),
  timeToTap: [
    { bucket: '< 1s', count: 301, sessions: 3 },
    { bucket: '1–5s', count: 44, sessions: 41 },
    { bucket: '5–30s', count: 61, sessions: 58 },
    { bucket: '> 30s', count: 38, sessions: 36 },
  ],
};

export const DEMO_SOURCE_PROFILE: AdminSourceProfile = {
  key: { type: 'ip24' as AdminSourceKeyType, value: 'c0ffee02' },
  firstSeenAt: daysAgo(11),
  lastSeenAt: minsAgo(3),
  comments: {
    total: 61,
    byStatus: { held: 60, published: 1, rejected: 0, deleted: 0 },
    rows: DEMO_COMMENTS.comments.slice(0, 2),
  },
  reactions: {
    total: 316,
    byTarget: [
      { targetType: 'post', targetId: '665f0a11', postTitle: 'The retry budget nobody wrote down', count: 304 },
      { targetType: 'comment', targetId: '01J8QK3M7Z', postTitle: 'One abstraction fewer', count: 12 },
    ],
    rows: DEMO_REACTIONS.reactions.slice(0, 3),
  },
  spread: {
    session: 47,
    ip: 12,
    ip24: 1,
    fp: 9,
    clientFp: 3,
    clientFpStable: 1,
    storageId: 2,
    email: 6,
    asn: 1,
    ua: 4,
  },
  hints: [
    { hint: 'no_input_events', kind: 'bot', count: 46 },
    { hint: 'instant_compose', kind: 'bot', count: 43 },
    { hint: 'webdriver', kind: 'bot', count: 12 },
    { hint: 'hosting_asn', kind: 'vpn', count: 61 },
  ],
  linked: {
    sessions: 8,
    via: { email: 6, clientFpStable: 0, storageId: 2 },
    carried: { ip24: 3, clientFpStable: 1, email: 6, storageId: 2 },
    comments: 64,
    held: 61,
    reactions: 318,
  },
  hourly: Array.from({ length: 12 }, (_, index) => ({
    hour: `${daysAgo(0).slice(0, 10)}T${String(index).padStart(2, '0')}`,
    comments: index >= 2 && index <= 5 ? 14 : 0,
    reactions: index >= 2 && index <= 5 ? 78 : 1,
  })),
  behaviour: {
    dwellMsMedian: 1_400,
    turnstileAgeMsMedian: 400,
    newSessionShare: 0.96,
    authMix: { turnstile: 61, pass: 3, verified: 0 },
  },
  bans: DEMO_BANS.bans.slice(0, 2) as AdminBan[],
};
