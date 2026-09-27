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
  clientFpStable: { source: 'client_fp_stable', ban: 'client_fp', label: 'Device fingerprint (stable)', explain: 'Similar browser environment across updates. Not a verified identity.' },
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

/** A hash is unreadable; eight characters are enough to see two as one. */
export function shortHandle(value: string): string {
  if (/^[0-9a-f]{16,}$/i.test(value)) return value.slice(0, 8);
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
  if (status === 'verified') return 'A signed-in reader wrote this. That was checked when it was written, not now.';
  if (status === 'claimed') {
    const how = actor.claimMethod === 'confirmed' ? 'by confirming their email' : actor.claimMethod === 'session' ? 'from the same browser session' : 'by an unknown method';
    return `Written anonymously, then linked to a reader account ${how}.`;
  }
  if (status === 'anonymous') return 'Written without signing in.';
  return 'Written before identity was recorded, so it is not known whether the writer was signed in.';
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

/** Why a comment is not simply published, in the moderator's terms. */
export interface WhyHere {
  tone: 'danger' | 'warning' | 'info';
  title: string;
  detail: string | null;
  /** 0..100 when the writer-risk score is known. */
  score: number | null;
  signals: string[];
}

const AWAITING_EMAIL = /^Awaiting email: (.*)$/s;
const SCORE_NOTE = /^score (\d+) \((.*)\)\.?$/s;

export function isAwaitingEmail(comment: PortalComment): boolean {
  return comment.status === 'held' && (comment.moderationNote ?? '').startsWith('Awaiting email');
}

export function whyHere(comment: PortalComment): WhyHere | null {
  if (comment.status === 'published' || comment.status === 'deleted') return null;
  const note = comment.moderationNote?.trim() || null;
  const reason = reasonLabel(comment.moderationReason);
  const model = comment.moderationModel ? ` (${comment.moderationModel})` : '';

  const awaiting = note ? AWAITING_EMAIL.exec(note) : null;
  if (comment.status === 'held' && awaiting) {
    const rest = awaiting[1].trim();
    const scored = SCORE_NOTE.exec(rest);
    if (scored) {
      return {
        tone: 'info',
        title: 'Waiting for the writer to confirm an email',
        detail: 'Their risk score asked for an email. It publishes by itself once they confirm, or you can approve it now.',
        score: Number(scored[1]),
        signals: scored[2].split(',').map((signal) => signal.trim()).filter(Boolean),
      };
    }
    return {
      tone: 'info',
      title: 'Waiting for the writer to confirm an email',
      detail: `${rest.charAt(0).toUpperCase()}${rest.slice(1)} It publishes by itself once they confirm, or you can approve it now.`,
      score: null,
      signals: [],
    };
  }

  if (comment.status === 'rejected') {
    return {
      tone: 'danger',
      title: reason ? `Rejected as ${reason.toLowerCase()}${model}` : `Rejected${model}`,
      detail: note,
      score: null,
      signals: [],
    };
  }

  return {
    tone: 'warning',
    title: reason ? `Held as possible ${reason.toLowerCase()}${model}` : `Held for review${model}`,
    detail: note ?? (reason ? null : 'The automatic checks could not decide, so it waits for you.'),
    score: null,
    signals: [],
  };
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

export function absoluteTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Where the comment lives on the public site. Blog rows key on Ghost ids
    and carry a slug; mood rows key on the numeric channel message id. The
    token is `commentAnchorToken(id)`, the row's `id="c-<token>"`. */
export function commentPublicUrl(comment: PortalComment, token: string | null): string | null {
  const anchor = token ? `#c-${token}` : '';
  if (comment.postSlug) return `/blog/${comment.postSlug}${anchor}`;
  if (/^\d+$/.test(comment.postId)) return `/mood/${comment.postId}${anchor}`;
  return null;
}
