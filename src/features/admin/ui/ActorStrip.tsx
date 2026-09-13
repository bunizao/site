/* Where a row came from, in one strip.

   The same block hangs under a queue row, a reaction row and every row on a
   source profile, so it lives here rather than in any one of them. Three
   bands, in the order a person reads them:

   1. The origin line: country, city, network, address, browser, how long
      they sat with the box open, and a `⚠` with the count when the write
      tripped bot hints. Facts, no verdict.
   2. The keys: one chip per key the row carried, each a link to that key's
      source profile, each red when that key is on the ban list right now.
      A chip is the whole pivot -- there is no other way to ask "who else".
   3. The cluster: what else shares each key inside the ninety-day window,
      this row excluded. A `3 held` next to a subnet is the sentence the
      whole feature exists to write.

   The two blobs -- the request's network and header set, and what the
   browser said about itself -- are behind a disclosure, because they are
   forty fields nobody reads until they are reading them very carefully.

   Nothing here is a verdict and nothing here acts. The Ban dialog is the
   only thing on this page that changes anything, and it starts from the
   chips below. */

import * as React from 'react';
import type {
  AdminBanKeyType,
  AdminClusterKey,
  AdminCommentActor,
  AdminSourceKeyType,
} from '@bunizao/contracts';

/** Cluster key to the key type the pivot and the ban list use, and whether
    a ban can hold it at all. `clientFp` and `clientFpStable` are both
    `client_fp` to a ban: it matches either hash. */
const KEY_KINDS: Record<AdminClusterKey, { source: AdminSourceKeyType; ban: AdminBanKeyType | null; label: string }> = {
  session: { source: 'session', ban: 'session', label: 'session' },
  ip: { source: 'ip', ban: 'ip', label: 'ip' },
  ip24: { source: 'ip24', ban: 'ip24', label: 'subnet' },
  fp: { source: 'fp', ban: 'fp', label: 'fp' },
  email: { source: 'email', ban: 'email', label: 'email' },
  clientFp: { source: 'client_fp', ban: 'client_fp', label: 'device' },
  clientFpStable: { source: 'client_fp_stable', ban: 'client_fp', label: 'device·stable' },
  storageId: { source: 'storage_id', ban: null, label: 'storage' },
  emailDomain: { source: 'email_domain', ban: 'email_domain', label: 'mail domain' },
  bodyHash: { source: 'body_hash', ban: null, label: 'body' },
};

const ORDER: AdminClusterKey[] = [
  'session', 'ip', 'ip24', 'fp', 'email', 'clientFp', 'clientFpStable', 'storageId', 'emailDomain', 'bodyHash',
];

export function sourceHref(type: AdminSourceKeyType, value: string): string {
  return `/dev/portal/comments/source/${encodeURIComponent(type)}/${encodeURIComponent(value)}`;
}

/** A hash is unreadable and its first eight characters are enough to see two
    rows as the same source. A domain is already readable, so it is left
    alone up to a length that does not break the line. */
export function shortHandle(value: string): string {
  if (/^[0-9a-f]{16,}$/i.test(value)) return value.slice(0, 8);
  return value.length > 28 ? `${value.slice(0, 27)}…` : value;
}

function duration(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 100) / 10}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/** Every key on the row, in a stable order, with the value the pivot needs
    and the value a person reads. Exported because the ban dialog ticks the
    same list. */
export function actorKeyChips(actor: AdminCommentActor): Array<{
  clusterKey: AdminClusterKey | 'domain';
  source: AdminSourceKeyType;
  ban: AdminBanKeyType | null;
  label: string;
  value: string;
  banned: boolean;
}> {
  const chips = ORDER.flatMap((key) => {
    const value = actor.keys[key];
    if (!value) return [];
    const kind = KEY_KINDS[key];
    return [{
      clusterKey: key,
      source: kind.source,
      ban: kind.ban,
      label: kind.label,
      value,
      banned: kind.ban !== null && actor.banned.includes(kind.ban),
    }];
  });
  const domains = actor.keys.linkDomains.map((domain) => ({
    clusterKey: 'domain' as const,
    source: 'domain' as AdminSourceKeyType,
    ban: 'domain' as AdminBanKeyType,
    label: 'link',
    value: domain,
    banned: actor.domainCluster.find((entry) => entry.domain === domain)?.banned ?? false,
  }));
  return [...chips, ...domains];
}

function Blob({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  if (rows.length === 0) return null;
  return (
    <details className="portal-actor__blob">
      <summary>{title}</summary>
      <dl>
        {rows.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== null && entry !== undefined)
      .map(([key, entry]) => `${key}: ${describe(entry)}`)
      .join(' · ');
  }
  return String(value);
}

function blobRows(source: Record<string, unknown> | null): Array<[string, string]> {
  if (!source) return [];
  return Object.entries(source)
    .map(([key, value]) => [key, describe(value)] as [string, string])
    .filter(([, value]) => value !== '');
}

export default function ActorStrip({ actor, onBan }: {
  actor: AdminCommentActor;
  /** Omitted on read-only surfaces; the queue and the profile pass it. */
  onBan?: (actor: AdminCommentActor) => void;
}) {
  const chips = actorKeyChips(actor);
  const origin = [
    [actor.country, actor.city].filter(Boolean).join(' · ') || null,
    actor.asOrg ? `AS${actor.asn ?? '?'} ${actor.asOrg}` : actor.asn ? `AS${actor.asn}` : null,
    actor.ip,
    [actor.browser, actor.os].filter(Boolean).join(' / ') || null,
    actor.email,
  ].filter(Boolean) as string[];

  const behaviour = [
    duration(actor.behaviour.dwellMs) ? `${duration(actor.behaviour.dwellMs)} in the box` : null,
    duration(actor.behaviour.turnstileAgeMs) ? `turnstile ${duration(actor.behaviour.turnstileAgeMs)}` : null,
    actor.behaviour.linkCount ? `${actor.behaviour.linkCount} link${actor.behaviour.linkCount === 1 ? '' : 's'}` : null,
    actor.behaviour.auth ?? null,
    actor.behaviour.emailMx === false ? 'no MX' : null,
    actor.behaviour.emailGravatar === true ? 'gravatar' : null,
    actor.sessionNew ? 'new session' : null,
  ].filter(Boolean) as string[];

  /* One line per key that actually has neighbours. A row whose every key is
     alone prints nothing here, which is the common and boring case. */
  const clusters = ORDER
    .map((key) => ({ key, count: actor.cluster[key] }))
    .filter(({ key, count }) => actor.keys[key] && count && (count.comments > 0 || count.reactions > 0));

  return (
    <div className="portal-actor">
      <div className="portal-actor__line">
        {origin.map((part) => <span key={part} className="portal-actor__fact">{part}</span>)}
        {actor.botHints > 0 && (
          <span className="portal-actor__fact" data-tone="danger" title={actor.client?.botHints.join(', ')}>
            ⚠ {actor.botHints} bot hint{actor.botHints === 1 ? '' : 's'}
          </span>
        )}
        {actor.client?.vpnHints.length ? (
          <span className="portal-actor__fact" data-tone="muted" title="Shown, never counted">
            {actor.client.vpnHints.join(' · ')}
          </span>
        ) : null}
      </div>

      {behaviour.length > 0 && (
        <div className="portal-actor__line" data-band="behaviour">
          {behaviour.map((part) => <span key={part} className="portal-actor__fact">{part}</span>)}
        </div>
      )}

      <div className="portal-actor__keys">
        {chips.map((chip) => (
          <a
            key={`${chip.source}:${chip.value}`}
            className="portal-actor__key"
            data-banned={chip.banned ? '' : undefined}
            href={sourceHref(chip.source, chip.value)}
            title={`${chip.label} ${chip.value}${chip.banned ? ' — on the ban list' : ''}`}
          >
            <span className="portal-actor__key-label">{chip.label}</span>
            <span className="portal-mono">{shortHandle(chip.value)}</span>
            {chip.banned && <span className="portal-actor__banned">banned</span>}
          </a>
        ))}
        {onBan && (
          <button type="button" className="portal-actor__ban" onClick={() => onBan(actor)}>
            Ban source…
          </button>
        )}
      </div>

      {(clusters.length > 0 || actor.domainCluster.length > 0) && (
        <div className="portal-actor__cluster">
          {clusters.map(({ key, count }) => (
            <a key={key} className="portal-actor__cluster-item" href={sourceHref(KEY_KINDS[key].source, actor.keys[key]!)}>
              <span className="portal-actor__key-label">{KEY_KINDS[key].label}</span>
              {count.comments > 0 && <span>{count.comments} more</span>}
              {count.held > 0 && <span data-tone="danger">{count.held} held</span>}
              {count.reactions > 0 && <span data-tone="muted">{count.reactions} ♥</span>}
            </a>
          ))}
          {actor.domainCluster.map((entry) => (
            <a key={entry.domain} className="portal-actor__cluster-item" href={sourceHref('domain', entry.domain)}>
              <span className="portal-actor__key-label">{entry.domain}</span>
              <span>{entry.comments} more</span>
              {entry.held > 0 && <span data-tone="danger">{entry.held} held</span>}
              {entry.banned && <span data-tone="danger">banned</span>}
            </a>
          ))}
        </div>
      )}

      <Blob title="Request" rows={blobRows(actor.detail as unknown as Record<string, unknown> | null)} />
      <Blob
        title="Browser"
        rows={[
          ...blobRows((actor.client?.components ?? null) as Record<string, unknown> | null),
          ...blobRows((actor.client?.interaction ?? null) as Record<string, unknown> | null),
        ]}
      />
    </div>
  );
}
