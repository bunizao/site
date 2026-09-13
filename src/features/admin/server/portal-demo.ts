import type { AdminBanKeyType, AdminClusterCount, AdminClusterKey, AdminCommentActor } from '@bunizao/contracts';
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
