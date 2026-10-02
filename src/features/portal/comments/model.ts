import type {
  AdminBanKeyType,
  AdminClusterKey,
  AdminCommentActor,
  AdminSourceKeyType,
} from '@bunizao/contracts';
import type { PortalComment } from '@/features/admin/server/portal-client';

/* Everything the comments screens say about a row, derived once. The labels
   here replace the old strip's `fp` / `fingerprint` pair, which read as one
   word abbreviated and led to banning the wrong key. */

export interface KeyKind {
  source: AdminSourceKeyType;
  ban: AdminBanKeyType | null;
  label: string;
  explain: string;
}

export const KEY_KINDS: Record<AdminClusterKey, KeyKind> = {
  session: { source: 'session', ban: 'session', label: 'Session', explain: 'Same browser session. A shared browser can be used by more than one person.' },
  email: { source: 'email', ban: 'email', label: 'Email', explain: 'Same address on the record. Check whether it was verified when written or claimed later.' },
  clientFp: { source: 'client_fp', ban: 'client_fp', label: 'Device fingerprint', explain: 'Similar browser environment. Matches can occur on unrelated devices.' },
  clientFpStable: { source: 'client_fp_stable', ban: 'client_fp', label: 'Stable fingerprint', explain: 'Similar browser environment across updates. Not a verified identity.' },
  storageId: { source: 'storage_id', ban: null, label: 'Browser storage', explain: 'Shared browser storage. A shared device, not necessarily one person.' },
  ip: { source: 'ip', ban: 'ip', label: 'IP address', explain: 'Shared network address. Other readers may use the same connection.' },
  ip24: { source: 'ip24', ban: 'ip24', label: 'Subnet', explain: 'Shared /24 subnet. Offices, campuses and carriers put many readers here.' },
  fp: { source: 'fp', ban: 'fp', label: 'Network signature', explain: 'Network and browser headers hashed together. Does not establish one person.' },
  emailDomain: { source: 'email_domain', ban: 'email_domain', label: 'Email domain', explain: 'Shared email provider or organization. Not an account match.' },
  bodyHash: { source: 'body_hash', ban: null, label: 'Same text', explain: 'Identical comment text. A content match, not an identity match.' },
};

/** Narrowest first: the order a moderator should read and ban in. */
export const KEY_ORDER: AdminClusterKey[] = [
  'session', 'email', 'clientFp', 'clientFpStable', 'storageId', 'ip', 'fp', 'ip24', 'emailDomain', 'bodyHash',
];

const EXTRA_SOURCES: Partial<Record<AdminSourceKeyType, { label: string; ban: AdminBanKeyType }>> = {
  asn: { label: 'Network', ban: 'asn' },
  domain: { label: 'Link domain', ban: 'domain' },
};

export function sourceLabel(type: AdminSourceKeyType): string {
  return EXTRA_SOURCES[type]?.label ?? Object.values(KEY_KINDS).find((kind) => kind.source === type)?.label ?? type;
}

/** The ban key a pivot can be banned by, or null for look-only keys. */
export function sourceBanKey(type: AdminSourceKeyType): AdminBanKeyType | null {
  if (EXTRA_SOURCES[type]) return EXTRA_SOURCES[type]!.ban;
  return Object.values(KEY_KINDS).find((kind) => kind.source === type)?.ban ?? null;
}

/** The keys that name one person: a session, and an address verified at
    writing. Every other key can reach readers who share it. */
export function namesOnePerson(ban: AdminBanKeyType, verified: boolean): boolean {
  return ban === 'session' || (ban === 'email' && verified);
}

/** What a ban deletes besides banning. `comment` is the one it was raised
    from, `fingerprint` also sweeps 90 days of the ticked keys and the
    writer's fingerprint, `matched` sweeps the ticked keys alone (a pivot
    ban, which has no comment). */
export type BanDelete = 'comment' | 'fingerprint' | 'matched' | 'none';

/** Why a ban must wait for the impact of exactly its keys, or null when it
    can go at once. A key other readers share waits whatever it deletes: a
    subnet banned blind is the risk either way. A sweep always waits. One
    person's keys and the open comment go at once, so B then Enter stays
    one motion. */
export function impactHold(bans: AdminBanKeyType[], verified: boolean, mode: BanDelete): 'shared' | 'removal' | null {
  if (bans.some((ban) => !namesOnePerson(ban, verified))) return 'shared';
  return mode === 'fingerprint' || mode === 'matched' ? 'removal' : null;
}

export interface BanKey {
  type: AdminBanKeyType;
  value: string;
}

/** The key a "same fingerprint" sweep adds: the fingerprint column's value
    under the ban type that matches it. Both device columns ban as
    `client_fp`, which matches either. */
export function fingerprintSweepKey(actor: AdminCommentActor): (BanKey & { label: string }) | null {
  const pivot = fingerprintPivot(actor);
  const type = pivot ? sourceBanKey(pivot.type) : null;
  return pivot && type ? { type, value: pivot.value, label: pivot.label } : null;
}

/** The delete half of the ban and preview input. A sweep key already ticked
    is left out: the purge matches ticked keys anyway. */
export function deleteScope(
  mode: BanDelete,
  keys: BanKey[],
  sweep: BanKey | null,
  commentId: string | null,
): { purge: boolean; sweepKeys?: BanKey[]; removeCommentId?: string } {
  const remove = commentId && (mode === 'comment' || mode === 'fingerprint') ? { removeCommentId: commentId } : {};
  if (mode === 'none' || mode === 'comment') return { purge: false, ...remove };
  const fresh = mode === 'fingerprint' && sweep
    && !keys.some((key) => key.type === sweep.type && key.value === sweep.value);
  return { purge: true, ...(fresh ? { sweepKeys: [{ type: sweep.type, value: sweep.value }] } : {}), ...remove };
}

export const SOURCE_TYPES: ReadonlySet<string> = new Set<string>([
  ...Object.values(KEY_KINDS).map((kind) => kind.source),
  'asn',
  'domain',
]);

/** Every comment sharing one key, on the same screen. `c` keeps a comment
    open across the pivot. */
export function pivotHref(type: AdminSourceKeyType, value: string, c?: string | null): string {
  const params = new URLSearchParams({ status: 'all', key: type, value });
  if (c) params.set('c', c);
  return `/comments?${params}`;
}

export interface Pivot {
  type: AdminSourceKeyType;
  value: string;
}

/** The writer column pivots on the narrowest key that names a person. */
export function writerPivot(actor: AdminCommentActor): Pivot | null {
  if (actor.keys.email) return { type: 'email', value: actor.keys.email };
  if (actor.keys.session) return { type: 'session', value: actor.keys.session };
  return null;
}

/** The fingerprint column: the device hash when the browser sent one,
    otherwise the network signature every row has. */
export function fingerprintPivot(actor: AdminCommentActor): (Pivot & { label: string }) | null {
  if (actor.keys.clientFp) return { type: 'client_fp', value: actor.keys.clientFp, label: 'Device fingerprint' };
  if (actor.keys.clientFpStable) return { type: 'client_fp_stable', value: actor.keys.clientFpStable, label: 'Stable fingerprint' };
  if (actor.keys.fp) return { type: 'fp', value: actor.keys.fp, label: 'Network signature' };
  return null;
}

export function ipPivot(actor: AdminCommentActor): Pivot | null {
  return actor.keys.ip ? { type: 'ip', value: actor.keys.ip } : null;
}

export interface ActorKey {
  id: string;
  source: AdminSourceKeyType;
  ban: AdminBanKeyType | null;
  label: string;
  explain: string;
  value: string;
  banned: boolean;
  /** Other rows in 90 days sharing this key. */
  others: { comments: number; held: number; reactions: number } | null;
}

export function actorKeys(actor: AdminCommentActor): ActorKey[] {
  const keys: ActorKey[] = KEY_ORDER.flatMap((name) => {
    const value = actor.keys[name];
    if (!value) return [];
    const kind = KEY_KINDS[name];
    return [{
      id: name,
      ...kind,
      value,
      banned: kind.ban !== null && actor.banned.includes(kind.ban),
      others: actor.cluster[name] ?? null,
    }];
  });
  for (const domain of actor.keys.linkDomains) {
    const cluster = actor.domainCluster.find((entry) => entry.domain === domain);
    keys.push({
      id: `domain:${domain}`,
      source: 'domain',
      ban: 'domain',
      label: 'Link domain',
      explain: 'A domain linked in the comment body.',
      value: domain,
      banned: cluster?.banned ?? false,
      others: cluster ? { comments: cluster.comments, held: cluster.held, reactions: 0 } : null,
    });
  }
  return keys;
}

export function isHash(value: string): boolean {
  return /^[0-9a-f]{16,}$/i.test(value);
}

/** A hash is unreadable; eight characters are enough to see two as one. */
export function shortHandle(value: string): string {
  if (isHash(value)) return value.slice(0, 8);
  return value.length > 28 ? `${value.slice(0, 27)}…` : value;
}

export type IdentityStatus = 'verified' | 'claimed' | 'anonymous' | 'unknown';

export const IDENTITY_LABELS: Record<IdentityStatus, string> = {
  verified: 'Verified',
  claimed: 'Claimed later',
  anonymous: 'Anonymous',
  unknown: 'Unknown identity',
};

export function identityStatus(actor: AdminCommentActor): IdentityStatus {
  if (actor.authAtWrite === 'verified') return 'verified';
  if (actor.readerId && actor.claimedAt) return 'claimed';
  return actor.authAtWrite === 'anonymous' ? 'anonymous' : 'unknown';
}

export function identityDetail(actor: AdminCommentActor): string {
  const status = identityStatus(actor);
  if (status === 'verified') return 'Signed in when writing';
  if (status === 'claimed') {
    const how = actor.claimMethod === 'confirmed' ? 'by confirming an email' : actor.claimMethod === 'session' ? 'from the same session' : 'by an unknown method';
    return `Anonymous, claimed later ${how}`;
  }
  if (status === 'anonymous') return 'Anonymous, not signed in';
  return 'Not recorded (written before identity was kept)';
}

export const REASON_LABELS: Record<string, string> = {
  ok: 'No problem found',
  spam: 'Spam',
  promotional: 'Promotion',
  abuse: 'Abuse',
  off_topic: 'Off topic',
  personal_info: 'Personal information',
  dwell_expired: 'Page left open too long',
};

export function reasonLabel(reason: string | null): string | null {
  if (!reason || reason === 'ok') return null;
  return REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

const AWAITING_EMAIL = /^Awaiting email: (.*)$/s;
const SCORE_NOTE = /^score (\d+) \(([^)]*)\)/;
const OWNER_NOTE = /^\w+ by the owner from (.+?)\.$/;
const AI_NOTE = /AI: \w+ -- (.*?)(?: Authorship: (\w+) -- (.*))?$/s;

const HEURISTICS: Record<string, string> = {
  duplicate_body: 'Same text as an earlier comment.',
  disposable_email: 'Throwaway email address.',
  keyword_blocklist: 'Contains a blocked word.',
  link_count: 'Too many links.',
};

export function isAwaitingEmail(comment: PortalComment): boolean {
  return comment.status === 'held' && (comment.moderationNote ?? '').startsWith('Awaiting email');
}

export interface Decision {
  /** What happened and who decided: "Rejected as spam by Akismet". */
  summary: string;
  /** Only what the summary lacks, such as the AI's reason. */
  detail: string | null;
}

const sentence = (text: string): string => {
  const trimmed = text.trim();
  return trimmed ? `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}${/[.!?)]$/.test(trimmed) ? '' : '.'}` : '';
};

/** Who decided and on what, from site-api's note. The note repeats the
    reason and the checker ("Akismet: spam."), so only the parts the
    summary lacks come back as detail. */
function decided(note: string | null, model: string | null): { by: string | null; detail: string | null } {
  const text = (note ?? '').replace(/^Email confirmed; still held\.\s*/, '');
  const owner = OWNER_NOTE.exec(text);
  if (owner) return { by: owner[1] === 'Telegram' ? 'by you in Telegram' : 'by you in the portal', detail: null };
  if (text.startsWith('Heuristic: ')) {
    const rule = text.slice('Heuristic: '.length).trim();
    return { by: 'by a rule', detail: HEURISTICS[rule] ?? sentence(rule.replace(/_/g, ' ')) };
  }
  if (text.startsWith('Declared agent: ')) return { by: 'by a rule', detail: sentence(text.slice('Declared agent: '.length)) };
  const shadow = /^Shadow-banned (writer|sender)\.$/.exec(text);
  if (shadow) return { by: `because the ${shadow[1]} is banned`, detail: null };
  const ai = AI_NOTE.exec(text);
  if (ai) {
    const authorship = ai[2] === 'agent' ? `Reads as written by an agent: ${ai[3]}` : ai[2] ? `Authorship unclear: ${ai[3]}` : null;
    return { by: 'by AI', detail: [sentence(ai[1]!), authorship && sentence(authorship)].filter(Boolean).join(' ') || null };
  }
  const by = !model ? null : model === 'akismet' ? 'by Akismet' : 'by AI';
  // "Akismet: spam." says nothing the summary does not.
  if (/^Akismet: [\w ]+\.$/.test(text)) return { by: by ?? 'by Akismet', detail: null };
  return { by, detail: text ? sentence(text) : null };
}

/** Why a held or rejected comment is where it is, each fact said once.
    Null for published and deleted rows. */
export function decisionOf(comment: PortalComment): Decision | null {
  if (comment.status === 'published' || comment.status === 'deleted') return null;
  const note = comment.moderationNote?.trim() || null;

  const awaiting = note ? AWAITING_EMAIL.exec(note) : null;
  if (comment.status === 'held' && awaiting) {
    const rest = awaiting[1]!.trim();
    const scored = SCORE_NOTE.exec(rest);
    const why = scored ? `Score ${scored[1]}${scored[2] ? `: ${scored[2]}` : ''}.` : sentence(rest.replace(/ Akismet: .*$/s, ''));
    const flagged = AI_NOTE.exec(rest);
    return { summary: 'Waiting for the writer to confirm an email', detail: [why, flagged && sentence(flagged[1]!)].filter(Boolean).join(' ') || null };
  }

  const verb = comment.status === 'rejected' ? 'Rejected' : 'Held';
  if (note === 'AI verdict pending.') return { summary: 'Held until the AI check answers', detail: null };
  const reason = reasonLabel(comment.moderationReason);
  const { by, detail } = decided(note, comment.moderationModel);
  if (!reason && !by && comment.status === 'held') {
    return { summary: 'Held for review: the checks could not decide', detail: null };
  }
  const what = reason ? `${verb} as ${reason.toLowerCase()}` : verb;
  return { summary: by ? `${what} ${by}` : what, detail };
}

/** Why a message sits in spam, in the comment decision's words. Every
    automatic filing writes a note; the owner's own filing writes none. */
export function spamDecision(note: string | null, model: string | null): Decision {
  const text = note?.trim() || null;
  if (!text && !model) return { summary: 'Filed as spam by you', detail: null };
  const { by, detail } = decided(text, model);
  return { summary: by ? `Filed as spam ${by}` : 'Filed as spam', detail };
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** `09-28 14:03`, local time: fixed width, sorts by eye. */
export function stamp(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `2026-09-28 14:03:22`, for the detail header and history. */
export function fullStamp(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: days > 330 ? 'numeric' : undefined });
}

// One formatter: building an Intl formatter per call costs more than the format.
const ABSOLUTE = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function absoluteTime(iso: string | null): string {
  if (!iso) return '';
  return ABSOLUTE.format(new Date(iso));
}

const OS_SHORT: Record<string, string> = {
  Windows: 'Win',
  macOS: 'Mac',
  'Mac OS': 'Mac',
  'Mac OS X': 'Mac',
  Android: 'Android',
  iOS: 'iOS',
  iPadOS: 'iPadOS',
  Linux: 'Linux',
  'Chrome OS': 'ChromeOS',
};

/** `Chrome 128 · Win` */
export function deviceShort(actor: AdminCommentActor): string {
  const os = actor.os ? (OS_SHORT[actor.os] ?? actor.os) : null;
  return [actor.browser, os].filter(Boolean).join(' · ');
}

/** `DE Berlin` */
export function locationShort(actor: AdminCommentActor): string {
  return [actor.country, actor.city].filter(Boolean).join(' ');
}

function duration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function subnetOf(ip: string | null): string | null {
  const match = ip ? /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip) : null;
  return match ? `${match[1]}.0/24` : null;
}

/** One line of the fingerprint record: a label, the whole value, and how
    many comments share it (this one included), which pivots. */
export interface RecordRow {
  id: string;
  label: string;
  value: string | null;
  /** Explanation of what a match on this key does and does not mean. */
  explain?: string;
  pivot: Pivot | null;
  /** Comments sharing the key, this one included; null when not counted. */
  count: number | null;
  held: number | null;
  /** Replaces `count` where rows of several kinds share the key: the pivot
      link's lines, one count a kind, or null when this row is the only one. */
  tally?: string[] | null;
  banned: boolean;
  mono: boolean;
}

export interface RecordGroup {
  title: string;
  rows: RecordRow[];
}

/** A key as a moderator reads it: the address, IP or subnet in plain text
    while the row still holds it, else the hash. */
export function keyValue(actor: AdminCommentActor, name: AdminClusterKey): string | null {
  if (name === 'email') return actor.email ?? actor.keys.email;
  if (name === 'ip') return actor.ip ?? actor.keys.ip;
  if (name === 'ip24') return subnetOf(actor.ip) ?? actor.keys.ip24;
  return actor.keys[name];
}

/** The network operator, pivoting on its number. Not a cluster key, so
    nothing counts it. */
export function asnRow(actor: AdminCommentActor): RecordRow {
  return {
    id: 'asn',
    label: 'Network',
    value: actor.asn ? `AS${actor.asn}${actor.asOrg ? ` ${actor.asOrg}` : ''}` : actor.asOrg,
    pivot: actor.asn ? { type: 'asn', value: String(actor.asn) } : null,
    count: null,
    held: null,
    banned: actor.asn !== null && actor.banned.includes('asn'),
    mono: false,
  };
}

function keyRow(actor: AdminCommentActor, name: AdminClusterKey): RecordRow {
  const value = keyValue(actor, name);
  const kind = KEY_KINDS[name];
  const key = actor.keys[name];
  const cluster = actor.cluster[name];
  return {
    id: name,
    label: kind.label,
    value,
    explain: kind.explain,
    pivot: key ? { type: kind.source, value: key } : null,
    count: key && cluster ? cluster.comments + 1 : null,
    held: key && cluster ? cluster.held : null,
    banned: Boolean(key) && kind.ban !== null && actor.banned.includes(kind.ban),
    mono: true,
  };
}

function plainRow(id: string, label: string, value: string | null | undefined, mono = false): RecordRow {
  return { id, label, value: value ?? null, pivot: null, count: null, held: null, banned: false, mono };
}

/** The whole fingerprint of a comment, flat: three groups of rows, each row
    readable without opening anything. */
export function fingerprintRecord(comment: PortalComment): RecordGroup[] {
  const actor = comment.actor;
  const detail = actor.detail;
  const client = actor.client;
  const components = client?.components ?? null;
  const screen = components?.screen;
  const hints = [
    ...(client?.botHints ?? []).map((hint) => `bot: ${hint}`),
    ...(client?.vpnHints ?? []).map((hint) => `vpn: ${hint}`),
  ];

  const keys: RecordRow[] = [
    keyRow(actor, 'session'),
    keyRow(actor, 'email'),
    keyRow(actor, 'clientFp'),
    keyRow(actor, 'clientFpStable'),
    keyRow(actor, 'storageId'),
    keyRow(actor, 'bodyHash'),
    ...actor.keys.linkDomains.map((domain): RecordRow => {
      const cluster = actor.domainCluster.find((entry) => entry.domain === domain);
      return {
        id: `domain:${domain}`,
        label: 'Link domain',
        value: domain,
        explain: 'A domain linked in the comment body.',
        pivot: { type: 'domain', value: domain },
        count: cluster ? cluster.comments + 1 : null,
        held: cluster?.held ?? null,
        banned: cluster?.banned ?? false,
        mono: true,
      };
    }),
  ];

  const network: RecordRow[] = [
    keyRow(actor, 'ip'),
    keyRow(actor, 'ip24'),
    keyRow(actor, 'fp'),
    keyRow(actor, 'emailDomain'),
    asnRow(actor),
    plainRow('colo', 'Edge', detail ? [detail.colo, detail.httpProtocol, detail.tlsVersion].filter(Boolean).join(' · ') || null : null),
    plainRow('rtt', 'Round trip', detail?.rttMs !== null && detail?.rttMs !== undefined ? `${detail.rttMs} ms` : null),
  ];

  const device: RecordRow[] = [
    plainRow('location', 'Location', [actor.city, detail?.region, actor.country].filter(Boolean).join(', ') || null),
    plainRow('device', 'Browser and OS', [actor.browser, actor.os].filter(Boolean).join(' on ') || null),
    plainRow('screen', 'Screen', screen?.width && screen.height
      ? `${screen.width}×${screen.height}${screen.dprPct ? ` @${screen.dprPct / 100}x` : ''}`
      : null),
    plainRow('languages', 'Languages', components?.navigator?.languages?.join(', ') ?? detail?.acceptLanguage ?? null),
    plainRow('timezone', 'Time zone', components?.timezone ?? detail?.timezone ?? null),
    plainRow('gpu', 'GPU', components?.webgl?.renderer ?? null),
    plainRow('dwell', 'Time on page', duration(actor.behaviour.dwellMs)),
    plainRow('turnstile', 'Turnstile age', duration(actor.behaviour.turnstileAgeMs)),
    plainRow('typing', 'Typing', client?.interaction
      ? [
          client.interaction.keyEvents !== undefined ? `${client.interaction.keyEvents} keys` : null,
          client.interaction.pasteEvents ? `${client.interaction.pasteEvents} pastes` : null,
          client.interaction.pointerType ? `sent by ${client.interaction.pointerType}` : null,
        ].filter(Boolean).join(', ') || null
      : null),
    plainRow('hints', 'Bot and VPN hints', hints.length > 0 ? hints.join(', ') : actor.botHints > 0 ? `${actor.botHints} bot hints` : 'None'),
    plainRow('ua', 'User agent', actor.ua, true),
  ];

  return [
    { title: 'Fingerprint', rows: keys },
    { title: 'Network', rows: network },
    { title: 'Device', rows: device },
  ];
}

/** Where the comment lives on the public site: the post's page as site-api
    names it (`/blog/<slug>`, `/mood/<id>`), at the comment's anchor. Null
    when site-api could not look the post up. The token is
    `commentAnchorToken(id)`, the row's `id="c-<token>"`. */
export function commentPublicUrl(comment: PortalComment, token: string | null): string | null {
  if (!comment.postPath) return null;
  return `${comment.postPath}${token ? `#c-${token}` : ''}`;
}
