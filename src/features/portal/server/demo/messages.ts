/* Demo answers for the owner's message inbox: the list with its per-state
   counts, one message with who a reply would reach and what else that
   address sent, the five filing acts, and the reply.

   Same paths, validation, error codes and state machine as site-api
   (src/pages/admin/messages/* and features/messages/server/messages-admin.ts
   and reply-mail.ts there):

     read       new -> read
     archive    anything but archived -> archived
     unarchive  archived -> replied if it was ever answered, else read
     spam       anything but spam -> spam
     unspam     spam -> replied if it was ever answered, else read

   An act the message is already past is 200 with `changed: false`. A reply
   files the message as replied unless it is archived (site-api's
   markOwnerMessageReplied guards on that), and no mail leaves the demo.

   Every message carries its sender's actor, the comment writer block.
   A sender who also comments writes from that writer's device, so the
   device pivot finds both. One sender typed Mira's address without being
   signed in: the address resolves to her reader, the device is nobody's
   she uses, and only a signed-in write would make it hers.

   Dispatched from demo-api.ts. A unit test passes its own store; the dev
   server uses the one seeded below. Only imported behind
   `import.meta.env.DEV`. */

import {
  MESSAGE_MAX_BODY_LENGTH,
  MESSAGE_MIN_BODY_LENGTH,
  MESSAGE_STATES,
  type AdminClusterCount,
  type AdminClusterKey,
  type AdminCommentActor,
  type AdminCommentRecord,
  type AdminOwnerMessage,
  type AdminOwnerMessageAction,
  type AdminOwnerMessageDetail,
  type AdminOwnerMessageListResult,
  type AdminOwnerMessageReplyability,
  type AdminSourceKeyType,
  type MessageState,
} from '@bunizao/contracts';
import { demoActor } from '@/features/admin/server/portal-demo';
import { CLUSTER_KEYS, actorMatchesKey, digest, writerDeviceActor, type MatchedMessage } from './comments';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/* site-api's limits, by the names it uses. */
const MESSAGE_LIST_DEFAULT_LIMIT = 30;
const MESSAGE_LIST_MAX_LIMIT = 100;
const MESSAGE_HISTORY_LIMIT = 20;
const ACTIONS: readonly AdminOwnerMessageAction[] = ['read', 'archive', 'unarchive', 'spam', 'unspam'];

export interface DemoMessageReader {
  readerId: string;
  email: string;
  banned: boolean;
}

export interface MessagesStore {
  /** Newest first. */
  messages: AdminOwnerMessage[];
  /** Who sent each message, by message id. */
  actors: Map<string, AdminCommentActor>;
  /** Verified readers by email hash: who a reply can reach. */
  readers: Map<string, DemoMessageReader>;
  /** Email hashes that bounced or complained. */
  suppressed: Set<string>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Portal-Demo': '1' },
  });
}

function fail(status: number, code: string): Response {
  return json({ error: code, message: code }, status);
}

async function readBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function isState(value: unknown): value is MessageState {
  return typeof value === 'string' && (MESSAGE_STATES as readonly string[]).includes(value);
}

/* site-api's INBOX_MESSAGE_STATES: what `state=inbox` reads. */
const INBOX_STATES: readonly MessageState[] = ['new', 'read', 'replied'];

/** An integer query value, the default when absent, null when malformed. */
function intParam(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

/** site-api's maskEmail: the receipt names the address without spelling it. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return 'this inbox';
  return `${local?.slice(0, 1) || '*'}***@${domain}`;
}

/* ------------------------------------------------------------------ */
/* Who a reply reaches                                                 */
/* ------------------------------------------------------------------ */

type Recipient = { ok: true; reader: DemoMessageReader } | { ok: false; reason: Exclude<AdminOwnerMessageReplyability, 'ok'> };

/** site-api's resolveReplyRecipient. A reader who confirmed after writing
    is found by the address, so `readerId` on the message may be null. */
function recipientOf(store: MessagesStore, message: AdminOwnerMessage): Recipient {
  if (!message.emailHash) return { ok: false, reason: 'no_address' };
  const reader = message.readerId
    ? [...store.readers.values()].find((entry) => entry.readerId === message.readerId)
    : store.readers.get(message.emailHash);
  if (!reader || reader.banned) return { ok: false, reason: 'unverified' };
  if (store.suppressed.has(message.emailHash)) return { ok: false, reason: 'suppressed' };
  return { ok: true, reader };
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

function list(store: MessagesStore, params: URLSearchParams): Response {
  // One state, `inbox` for the three the Inbox tray shows, or none.
  const rawState = params.get('state');
  let states: readonly MessageState[] | undefined;
  if (rawState) {
    if (rawState === 'inbox') states = INBOX_STATES;
    else if (isState(rawState)) states = [rawState];
    else return fail(400, 'invalid_state');
  }
  const limit = intParam(params.get('limit'), MESSAGE_LIST_DEFAULT_LIMIT);
  if (limit === null || limit < 1 || limit > MESSAGE_LIST_MAX_LIMIT) return fail(400, 'invalid_limit');
  const offset = intParam(params.get('offset'), 0);
  if (offset === null || offset < 0) return fail(400, 'invalid_offset');

  const counts = Object.fromEntries(MESSAGE_STATES.map((name) => [name, 0])) as Record<MessageState, number>;
  for (const message of store.messages) counts[message.state] += 1;
  const matching = states ? store.messages.filter((message) => states.includes(message.state)) : store.messages;
  const page = matching
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(offset, offset + limit);
  const end = offset + page.length;
  const result: AdminOwnerMessageListResult = {
    messages: structuredClone(page),
    counts,
    total: matching.length,
    nextOffset: end < matching.length ? end : null,
  };
  return json(result);
}

/** What else shares each of the sender's keys: comments (and how many are
    held) from the comment store, other messages from this one. Reactions
    live in the moderation module and count nothing here. */
function clustersOf(store: MessagesStore, id: string, actor: AdminCommentActor, comments: readonly AdminCommentRecord[]) {
  const cluster: Partial<Record<AdminClusterKey, AdminClusterCount>> = {};
  for (const key of CLUSTER_KEYS) {
    const value = actor.keys[key];
    if (!value) continue;
    const alike = comments.filter((row) => row.actor.keys[key] === value);
    const messages = [...store.actors].filter(([other, entry]) => other !== id && entry.keys[key] === value);
    cluster[key] = {
      comments: alike.length,
      held: alike.filter((row) => row.status === 'held').length,
      reactions: 0,
      messages: messages.length,
    };
  }
  return { ...actor.cluster, ...cluster };
}

function detail(store: MessagesStore, id: string, comments: readonly AdminCommentRecord[]): Response {
  const message = store.messages.find((entry) => entry.id === id);
  if (!message) return fail(404, 'message_not_found');
  const actor = store.actors.get(id);
  const recipient = recipientOf(store, message);
  const history = message.emailHash
    ? store.messages
      .filter((entry) => entry.emailHash === message.emailHash && entry.id !== message.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MESSAGE_HISTORY_LIMIT)
    : [];
  const result: AdminOwnerMessageDetail = {
    message: structuredClone(message),
    sender: recipient.ok
      ? { replyable: 'ok', email: recipient.reader.email, readerId: recipient.reader.readerId }
      : { replyable: recipient.reason, email: null, readerId: message.readerId },
    history: structuredClone(history),
    ...(actor && { actor: structuredClone({ ...actor, cluster: clustersOf(store, id, actor, comments) }) }),
  };
  return json(result);
}

/** The state an act moves a message to, or null when it is already past it. */
function nextState(message: AdminOwnerMessage, action: AdminOwnerMessageAction): MessageState | null {
  const settled: MessageState = message.repliedAt ? 'replied' : 'read';
  switch (action) {
    case 'read': return message.state === 'new' ? 'read' : null;
    case 'archive': return message.state !== 'archived' ? 'archived' : null;
    case 'unarchive': return message.state === 'archived' ? settled : null;
    case 'spam': return message.state !== 'spam' ? 'spam' : null;
    case 'unspam': return message.state === 'spam' ? settled : null;
  }
}

async function act(store: MessagesStore, id: string, request: Request): Promise<Response> {
  const body = await readBody<{ action?: unknown }>(request);
  if (!body) return fail(400, 'invalid_json');
  const action = body.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) return fail(400, 'invalid_action');
  const message = store.messages.find((entry) => entry.id === id);
  if (!message) return fail(404, 'message_not_found');

  const next = nextState(message, action as AdminOwnerMessageAction);
  if (!next) return json({ message: structuredClone(message), changed: false });
  message.state = next;
  message.updatedAt = new Date().toISOString();
  return json({ message: structuredClone(message), changed: true });
}

async function reply(store: MessagesStore, id: string, request: Request): Promise<Response> {
  const body = await readBody<{ body?: unknown }>(request);
  if (!body) return fail(400, 'invalid_json');
  if (typeof body.body !== 'string') return fail(400, 'invalid_body');
  const text = body.body.trim();
  if (text.length < MESSAGE_MIN_BODY_LENGTH || text.length > MESSAGE_MAX_BODY_LENGTH) return fail(400, 'invalid_body');

  const message = store.messages.find((entry) => entry.id === id);
  if (!message) return fail(404, 'message_not_found');
  const recipient = recipientOf(store, message);
  if (!recipient.ok) return fail(409, recipient.reason);

  // The mail "leaves" here. The row follows only when it is not archived.
  if (message.state !== 'archived') {
    const stamp = new Date().toISOString();
    message.state = 'replied';
    message.repliedAt = stamp;
    message.updatedAt = stamp;
  }
  return json({
    message: structuredClone(message),
    recipientName: message.displayName,
    recipientEmail: maskEmail(recipient.reader.email),
  });
}

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */

interface Sender {
  name: string;
  hash: string | null;
  /** A verified reader behind the address, if any. Their messages are
      written signed in. */
  reader?: { readerId: string; email: string; banned?: boolean };
  /** The address typed, for a sender no reader account stands behind. */
  address?: string;
  suppressed?: boolean;
  country: string | null;
  locale: 'en' | 'zh';
  city: string;
  asn: number;
  asOrg: string;
  /** Where a sender with no comment device (demo/comments.ts) wrote from. */
  device?: { browser: string; os: string; ip: string };
}

const SENDERS = {
  mira: { name: 'Mira', hash: 'a1f0c3e9d2b47a10', reader: { readerId: 'reader-3f9a1c', email: 'mira.k@example.de' }, country: 'DE', locale: 'en', city: 'Berlin', asn: 3320, asOrg: 'Deutsche Telekom' },
  kobayashi: { name: '小林', hash: 'b27d91c04e3a5f62', address: 'kobayashi.h@example.jp', country: 'JP', locale: 'zh', city: 'Tokyo', asn: 2516, asOrg: 'KDDI' },
  anonymous: { name: 'A reader', hash: null, country: 'AU', locale: 'en', city: 'Melbourne', asn: 1221, asOrg: 'Telstra', device: { browser: 'Safari 18', os: 'iOS', ip: '1.144.108.23' } },
  priya: { name: 'Priya', hash: 'c93e0a7b15d2f804', reader: { readerId: 'reader-81c2d0', email: 'priya.r@example.in' }, suppressed: true, country: 'IN', locale: 'en', city: 'Bengaluru', asn: 24560, asOrg: 'Bharti Airtel' },
  jie: { name: '阿杰', hash: 'd40b6f28a9c1e375', reader: { readerId: 'reader-5e7b33', email: 'ajie@example.tw' }, country: 'TW', locale: 'zh', city: 'Taipei', asn: 3462, asOrg: 'Chunghwa Telecom' },
  sam: { name: 'Sam Carter', hash: 'e5c17d3f02b8a946', reader: { readerId: 'reader-c0a915', email: 'sam.carter@example.com' }, country: 'US', locale: 'en', city: 'Portland', asn: 7922, asOrg: 'Comcast' },
  tomasz: { name: 'tomasz', hash: 'f6a28e4c13d9b057', reader: { readerId: 'reader-77d0e2', email: 'tomasz.w@example.pl', banned: true }, country: 'PL', locale: 'en', city: 'Warsaw', asn: 5617, asOrg: 'Orange Polska' },
  lea: { name: 'Léa', hash: '07b39f5d24e0c168', reader: { readerId: 'reader-2b4f86', email: 'lea.m@example.fr' }, country: 'FR', locale: 'en', city: 'Lyon', asn: 3215, asOrg: 'Orange' },
  anna: { name: 'Anna', hash: '18c40a6e35f1d279', reader: { readerId: 'reader-9d13a7', email: 'anna.s@example.edu' }, country: 'AT', locale: 'en', city: 'Vienna', asn: 8447, asOrg: 'A1 Telekom Austria', device: { browser: 'Chrome 129', os: 'Windows', ip: '84.115.201.9' } },
  seo: { name: 'SEO Growth Team', hash: '29d51b7f46a2e38a', address: 'team@seo-growth.example', country: 'US', locale: 'en', city: 'New York', asn: 14061, asOrg: 'DigitalOcean', device: { browser: 'Chrome 128', os: 'Linux', ip: '167.99.41.12' } },
  signals: { name: 'Crypto Signals VIP', hash: '3ae62c8057b3f49b', address: 'vip@moonsignals.example', country: 'NL', locale: 'en', city: 'Amsterdam', asn: 60781, asOrg: 'LeaseWeb', device: { browser: 'Chrome 128', os: 'Windows', ip: '37.48.87.14' } },
  guest: { name: 'Editorial Outreach', hash: '4bf73d9168c4a5ac', address: 'outreach@editorial-links.example', country: 'GB', locale: 'en', city: 'London', asn: 20473, asOrg: 'Vultr', device: { browser: 'Firefox 131', os: 'Windows', ip: '45.77.63.8' } },
  nanfeng: { name: '南风', hash: '5c084eaa79d5b6bd', reader: { readerId: 'reader-4a60f1', email: 'nanfeng@example.cn' }, country: 'CN', locale: 'zh', city: 'Hangzhou', asn: 4134, asOrg: 'China Telecom' },
  // Mira's address, typed signed out through a VPN exit in Frankfurt.
  impostor: { name: 'Mira K.', hash: 'a1f0c3e9d2b47a10', address: 'mira.k@example.de', country: 'DE', locale: 'en', city: 'Frankfurt', asn: 9009, asOrg: 'M247', device: { browser: 'Chrome 129', os: 'Windows', ip: '185.206.224.67' } },
} satisfies Record<string, Sender>;

type SenderKey = keyof typeof SENDERS;

interface SeedRow {
  sender: SenderKey;
  hoursAgo: number;
  state: MessageState;
  body: string;
  /** Hours after it arrived that the owner answered. */
  repliedAfter?: number;
  spam?: { note: string; model: string };
}

const SEED: SeedRow[] = [
  { sender: 'mira', hoursAgo: 0.4, state: 'new', body: 'Your post on retry budgets finally gave me words for an argument I lose every quarter. Would you mind if I translated it into German for our internal wiki? I would link back, of course.' },
  { sender: 'kobayashi', hoursAgo: 2.1, state: 'new', body: '你好！请问博客正文用的是哪一款字体？在手机上读起来特别舒服。' },
  { sender: 'anonymous', hoursAgo: 5.3, state: 'new', body: 'Just wanted to say the mood page is the calmest corner of the internet I know. No reply needed.' },
  { sender: 'priya', hoursAgo: 9.6, state: 'new', body: 'Hi! I run a small meetup in Bengaluru on edge runtimes. Any chance you would give a 20-minute remote talk in November? Happy to work around your time zone.' },
  { sender: 'jie', hoursAgo: 20.2, state: 'new', body: 'Workers 冷启动那篇里的测试脚本能分享一下吗？我想在我们自己的环境里复现一下。\n\n另外，第二张图的纵轴单位是毫秒吗？' },
  { sender: 'anna', hoursAgo: 26, state: 'spam', body: 'Hi, I am a master student writing my thesis on edge computing. Could I ask you three short questions about how you run your blog on Workers? It would take ten minutes at most.', spam: { note: 'Akismet: spam.', model: 'akismet' } },
  { sender: 'sam', hoursAgo: 31, state: 'read', body: 'Found a small typo in "One abstraction fewer": third paragraph, "it\'s" should be "its". Great piece otherwise.' },
  { sender: 'seo', hoursAgo: 38, state: 'spam', body: 'Hello, I noticed your website could rank much higher on Google. We offer guaranteed first-page placement from $99/month. Reply for a free audit!', spam: { note: 'Akismet: spam.', model: 'akismet' } },
  { sender: 'tomasz', hoursAgo: 49, state: 'read', body: 'Is there a way to subscribe to only the English posts? The Chinese ones are lovely but I cannot read them.' },
  { sender: 'mira', hoursAgo: 72, state: 'read', body: 'Quick question: is the RSS feed full text or excerpts? My reader only shows the first paragraph.' },
  { sender: 'signals', hoursAgo: 76, state: 'spam', body: 'Join t.me/moonsignalsvip for 300% weekly gains!!! Only 20 seats left, admin approves in 5 minutes.', spam: { note: 'Unsolicited promotion with an outbound link.', model: 'akismet+task-guard' } },
  { sender: 'lea', hoursAgo: 96, state: 'replied', repliedAfter: 5, body: 'Merci for the Friday deploy post. Did you ever get pushback from your team when you started doing it on purpose?' },
  { sender: 'nanfeng', hoursAgo: 118, state: 'read', body: '看了你写的 ORM 那篇，想问一下你们现在迁移是怎么管的？手写 SQL 文件还是有工具？' },
  { sender: 'guest', hoursAgo: 122, state: 'spam', body: 'Dear editor, we would love to contribute a high-quality guest post to your blog. We pay $150 per article with one dofollow link.', spam: { note: 'Pitch for paid guest posts.', model: 'akismet+task-guard' } },
  { sender: 'mira', hoursAgo: 144, state: 'replied', repliedAfter: 12, body: 'Loved "写给三年后的自己" (with a translator open). Mind if I quote one line of it in my newsletter?' },
  { sender: 'jie', hoursAgo: 192, state: 'replied', repliedAfter: 2, body: '请问评论区是自己写的吗？看起来很轻，没有加载任何第三方脚本。' },
  { sender: 'sam', hoursAgo: 240, state: 'archived', body: 'Thanks for the ORM post. We had the exact same migration story, down to the 3am rollback.' },
  { sender: 'lea', hoursAgo: 288, state: 'archived', repliedAfter: 4, body: 'Here is the talk on retry storms I mentioned in my last message. Slides are linked in the description.' },
  { sender: 'anonymous', hoursAgo: 360, state: 'archived', body: 'Test message, please ignore.' },
  { sender: 'kobayashi', hoursAgo: 480, state: 'archived', body: '新年快乐！谢谢你一直在写。' },
  { sender: 'nanfeng', hoursAgo: 600, state: 'replied', repliedAfter: 30, body: '博客的暗色模式在 iPad 上顶部有一条白边，不知道是不是 Safari 的问题。' },
  { sender: 'priya', hoursAgo: 700, state: 'read', body: 'Do you have a talk recording of the Workers cold start numbers? Would love to share it with the meetup.' },
  // Last, so the rows above keep their ids.
  { sender: 'impostor', hoursAgo: 1.2, state: 'new', body: 'Your retry budget post is a lazy rewrite of somebody else\'s talk. I will be saying so under every post you publish from now on.' },
];

/** site-api's sweepTypedMessageEmails: a typed address goes a week on. */
const TYPED_EMAIL_DAYS = 7;

/** The sender's actor: on their comment device when they have one, else
    on the device named here. The email key is the message's address hash,
    and only a signed-in write names a reader. */
function senderActor(key: SenderKey, sender: Sender, message: AdminOwnerMessage, now: number): AdminCommentActor {
  const verified = message.authAtWrite === 'verified';
  const ip = sender.device?.ip ?? '203.0.113.7';
  const base = demoActor({
    country: sender.country,
    city: sender.city,
    asn: sender.asn,
    asOrg: sender.asOrg,
    browser: sender.device?.browser ?? null,
    os: sender.device?.os ?? null,
    ip,
    keys: {
      session: digest(`message-session:${key}`),
      ip: digest(`ip:${ip}`),
      ip24: digest(`ip24:${ip.split('.').slice(0, 3).join('.')}`),
      fp: digest(`message-fp:${key}`),
      clientFp: digest(`message-client-fp:${key}`),
      clientFpStable: digest(`message-client-fp-stable:${key}`),
      storageId: digest(`message-storage:${key}`),
    },
  });
  const actor = writerDeviceActor(sender.name, base, message.body, verified) ?? base;
  const kept = verified || now - Date.parse(message.createdAt) < TYPED_EMAIL_DAYS * DAY;
  const address = sender.reader?.email ?? sender.address ?? null;
  const email = kept ? address : null;
  return {
    ...actor,
    readerId: verified ? message.readerId : null,
    authAtWrite: message.authAtWrite ?? 'unknown',
    email,
    keys: {
      ...actor.keys,
      email: sender.hash,
      emailDomain: address?.split('@')[1] ?? null,
      bodyHash: digest(`body:${message.body}`),
    },
  };
}

export function seedMessages(now = Date.now()): MessagesStore {
  const readers = new Map<string, DemoMessageReader>();
  const suppressed = new Set<string>();
  for (const sender of Object.values(SENDERS) as Sender[]) {
    if (!sender.hash) continue;
    if (sender.reader) readers.set(sender.hash, { readerId: sender.reader.readerId, email: sender.reader.email, banned: sender.reader.banned ?? false });
    if (sender.suppressed) suppressed.add(sender.hash);
  }
  const actors = new Map<string, AdminCommentActor>();
  const messages = SEED.map((row, index): AdminOwnerMessage => {
    const sender: Sender = SENDERS[row.sender];
    const createdAt = new Date(now - row.hoursAgo * HOUR).toISOString();
    const repliedAt = row.repliedAfter === undefined ? null : new Date(now - (row.hoursAgo - row.repliedAfter) * HOUR).toISOString();
    const touched = row.state === 'new' ? createdAt : new Date(Math.min(now, Date.parse(repliedAt ?? createdAt) + DAY / 4)).toISOString();
    // site-api's findReaderByEmailHash: whoever the address resolves to,
    // signed in or not. Only a live reader session makes it `verified`.
    const reader = sender.hash ? readers.get(sender.hash) : undefined;
    const message: AdminOwnerMessage = {
      id: `01J9MSG${String(index + 1).padStart(4, '0')}A7Q3W8E2R4T6Y9Z`,
      state: row.state,
      displayName: sender.name,
      body: row.body,
      locale: sender.locale,
      readerId: reader && !reader.banned ? reader.readerId : null,
      authAtWrite: sender.reader && !sender.reader.banned ? 'verified' : 'anonymous',
      emailHash: sender.hash,
      spamNote: row.spam?.note ?? null,
      spamModel: row.spam?.model ?? null,
      repliedAt,
      country: sender.country,
      createdAt,
      updatedAt: touched,
    };
    actors.set(message.id, senderActor(row.sender, sender, message, now));
    return message;
  });
  return { messages: messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), actors, readers, suppressed };
}

/* One store per dev-server process, like demo-api.ts's. */
let devStore = seedMessages();

/** Back to the seed, for demo-api.ts's reset. */
export function resetMessagesDemo(): void {
  devStore = seedMessages();
}

/** The messages a pivot key reaches, with their senders, for the source
    profile in demo/comment-admin.ts. */
export function messagesMatching(type: AdminSourceKeyType, value: string, store: MessagesStore = devStore): MatchedMessage[] {
  return store.messages.flatMap((message) => {
    const actor = store.actors.get(message.id);
    return actor && actorMatchesKey(actor, type, value) ? [{ message: structuredClone(message), actor }] : [];
  });
}

/** Answers `admin/messages[/…]`, or null for a path this module does not
    own. `segments` starts after `admin`; `comments` is the demo comment
    store a sender's keys are counted against. */
export async function handleMessagesDemo(
  request: Request,
  segments: string[],
  comments: readonly AdminCommentRecord[] = [],
  store: MessagesStore = devStore,
): Promise<Response | null> {
  const [resource, ...rest] = segments;
  if (resource !== 'messages') return null;
  const method = request.method.toUpperCase();
  if (rest.length === 0 && method === 'GET') return list(store, new URL(request.url).searchParams);
  if (rest.length === 1 && method === 'GET') return detail(store, rest[0], comments);
  if (rest.length === 1 && method === 'POST') return act(store, rest[0], request);
  if (rest.length === 2 && rest[1] === 'reply' && method === 'POST') return reply(store, rest[0], request);
  return null;
}
