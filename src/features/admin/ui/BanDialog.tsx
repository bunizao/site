/* Session and confirmed-address bans are selected by default. Shared
   network, fingerprint and domain keys need an explicit choice. */

import * as React from 'react';
import { Button, Checkbox, Label, Textarea } from '@/components/coss';
import type { AdminBanInput, AdminBanKeyType, AdminBanPreview, AdminBanResult, AdminCommentActor, AdminSourceKeyType } from '@bunizao/contracts';
import { actorKeyChips, shortHandle, sourceBanKey } from './ActorStrip';
import { adminApiEndpoint } from './api';

const SHARED_WARNING: Partial<Record<AdminBanKeyType, string>> = {
  email: 'An unconfirmed address can be entered by anybody.',
  ip: 'A shared address can belong to unrelated readers on the same network.',
  fp: 'This network and browser signature can be shared by unrelated readers.',
  client_fp: 'Browser fingerprints can collide across devices. A match does not identify one person.',
  domain: 'Blocks every comment linking to this domain, including legitimate references.',
  ip24: 'Blocks everyone on this subnet, including shared offices, carrier NATs and campuses.',
  asn: 'Blocks an entire network operator.',
  email_domain: 'Blocks every address at this domain.',
};

type SourceBanTarget = {
  type: AdminSourceKeyType;
  value: string;
  emailDomainPublishedComments?: number | null;
};

const EXPIRY_CHOICES = [
  { label: 'No expiry', value: '' },
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
];

export default function BanDialog({ actor, source, demo, onClose, onDone }: {
  actor?: AdminCommentActor;
  source?: SourceBanTarget;
  demo?: boolean;
  onClose: () => void;
  onDone: (result: AdminBanResult) => void;
}) {
  const chips = React.useMemo(() => {
    if (source) {
      const ban = sourceBanKey(source.type);
      return ban ? [{ ban, label: source.type, value: source.value, banned: false }] : [];
    }
    return actor ? actorKeyChips(actor).filter((chip) => chip.ban !== null) : [];
  }, [actor, source]);
  const published = source?.emailDomainPublishedComments ?? actor?.emailDomainPublishedComments;
  const domainProtected = published === null || published === undefined || published > 10;
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(
    chips.filter((chip) => chip.ban === 'session'
      || (chip.ban === 'email' && !source && actor?.authAtWrite === 'verified'))
      .map((chip) => `${chip.ban}:${chip.value}`),
  ));
  const [note, setNote] = React.useState('');
  const [days, setDays] = React.useState('7');
  const [purge, setPurge] = React.useState(false);
  const [revoke, setRevoke] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ input: AdminBanInput; impact: AdminBanPreview } | null>(null);

  const toggle = (id: string) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function reviewImpact(): Promise<void> {
    const keys = chips
      .filter((chip) => ticked.has(`${chip.ban}:${chip.value}`)
        && !(chip.ban === 'email_domain' && domainProtected))
      .map((chip) => ({ type: chip.ban!, value: chip.value }));
    if (keys.length === 0) {
      setError('Tick at least one key.');
      return;
    }
    if (demo) {
      setError('Demo data — the site-api binding is unavailable in local dev.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input: AdminBanInput = {
        keys,
        note: note.trim() || undefined,
        expiresAt: days ? new Date(Date.now() + Number(days) * 86_400_000).toISOString() : null,
        purge,
        revokeReaderId: revoke && !source ? actor?.readerId : null,
      };
      const response = await fetch(adminApiEndpoint('/bans/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, revokeReaderId: input.revokeReaderId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { message?: string; error?: string }).message
          || (payload as { error?: string }).error || `HTTP ${response.status}`);
      }
      setPreview({ input, impact: await response.json() as AdminBanPreview });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    if (!preview) return;
    if (preview.input.purge && !preview.impact.purgeAllowed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint('/bans'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preview.input),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      }
      onDone(await response.json() as AdminBanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to apply ban.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-ban" role="dialog" aria-modal="true" aria-label="Ban this source">
      <div className="portal-ban__sheet">
        <h3 className="portal-ban__title">Ban this source</h3>
        <p className="portal-ban__lede">
          Held comments and silent hearts, not a refusal. Nothing here tells them they were banned.
        </p>

        {!preview && <>
        <ul className="portal-ban__keys">
          {chips.map((chip) => {
            const id = `${chip.ban}:${chip.value}`;
            const warning = chip.ban === 'email' && actor?.authAtWrite === 'verified' && !source
              ? undefined : SHARED_WARNING[chip.ban!];
            const disabled = chip.ban === 'email_domain' && domainProtected;
            return (
              <li key={id} data-wide={warning ? '' : undefined}>
                <label>
                  <Checkbox checked={ticked.has(id)} disabled={disabled || busy} onCheckedChange={() => toggle(id)} />
                  <span className="portal-actor__key-label">{chip.label}</span>
                  <span className="portal-mono">{shortHandle(chip.value)}</span>
                  {chip.banned && <span className="portal-actor__banned">already banned</span>}
                </label>
                {warning && <p className="portal-ban__warn">{warning}</p>}
                {chip.ban === 'email_domain' && (
                  <p className="portal-ban__warn">
                    {published === null || published === undefined
                      ? 'Unavailable: the published-comment count could not be loaded.'
                      : `${published} published comments in the last 90 days.${disabled ? ' Domain bans are disabled above 10.' : ''}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <Label htmlFor="ban-note">Note</Label>
        <Textarea
          id="ban-note"
          rows={2}
          value={note}
          disabled={busy}
          placeholder="What this was. Read later, by you."
          onChange={(event) => setNote(event.target.value)}
        />

        <Label htmlFor="ban-expiry">Expiry</Label>
        <select
          id="ban-expiry"
          className="portal-ban__select"
          value={days}
          disabled={busy}
          onChange={(event) => setDays(event.target.value)}
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>

        <label className="portal-ban__switch">
          <Checkbox checked={purge} disabled={busy} onCheckedChange={(next) => setPurge(next === true)} />
          <span>
            Also purge the last 90 days — comments are soft-deleted and hearts removed, each logged.
          </span>
        </label>

        {actor?.readerId && actor.authAtWrite === 'verified' && !source && (
          <label className="portal-ban__switch">
            <Checkbox checked={revoke} disabled={busy} onCheckedChange={(next) => setRevoke(next === true)} />
            <span>This writer has a confirmed account. Ban the account too.</span>
          </label>
        )}
        </>}

        {preview && <div className="portal-ban__preview" data-ban-preview>
          <h4>Review the impact</h4>
          <p>Matching records in the last {preview.impact.windowDays} days. Shared keys can include unrelated readers.</p>
          <ul className="portal-spread">
            <li><span>Accounts</span><strong>{preview.impact.accounts}</strong></li>
            <li><span>Sessions</span><strong>{preview.impact.sessions}</strong></li>
            <li><span>Comments</span><strong>{preview.impact.comments.total}</strong></li>
            <li><span>Published comments</span><strong>{preview.impact.comments.published}</strong></li>
            <li><span>Held comments</span><strong>{preview.impact.comments.held}</strong></li>
            <li><span>Reactions</span><strong>{preview.impact.reactions}</strong></li>
          </ul>
          <p>Keys: {preview.input.keys.map((key) => `${key.type} ${shortHandle(key.value)}`).join(', ')}.</p>
          <p>{preview.input.expiresAt ? `Expires ${new Date(preview.input.expiresAt).toLocaleString()}.` : 'No expiry.'}</p>
          <p>{preview.input.purge
            ? `Remove ${preview.impact.purge.comments} comments and ${preview.impact.purge.reactions} reactions. Restoration is a separate action in operation history.`
            : 'Existing comments and reactions stay in place.'}</p>
          {preview.input.purge && !preview.impact.purgeAllowed && <p role="alert">
            This selection exceeds the {preview.impact.purgeLimit}-record removal limit. Narrow the selection or turn off removal before applying.
          </p>}
          {preview.input.revokeReaderId && <p>The confirmed account will also be banned.</p>}
        </div>}

        {error && <div className="portal-notice" data-variant="error"><span>{error}</span></div>}

        <div className="portal-ban__acts">
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {preview && <Button size="sm" variant="outline" onClick={() => { setPreview(null); setError(null); }} disabled={busy}>Change selection</Button>}
          <Button size="sm" variant={preview ? 'destructive' : 'default'}
            onClick={() => void (preview ? apply() : reviewImpact())}
            disabled={busy || ticked.size === 0 || Boolean(preview?.input.purge && !preview.impact.purgeAllowed)}>
            {busy ? 'Working…' : preview ? 'Apply ban' : 'Preview impact'}
          </Button>
        </div>
      </div>
      <button type="button" className="portal-ban__scrim" aria-label="Close" onClick={onClose} />
    </div>
  );
}
