/* The only thing in the portal that stops somebody.

   It opens with the narrow set already ticked -- the address, the IP, the
   server-side fingerprint, the device hash and every link domain on the row
   -- because those are the keys that identify this writer and not their
   neighbours. The wide ones are offered and left unticked: a subnet holds
   everyone behind one NAT, an ASN holds a carrier, and a mail domain holds
   gmail.com if you are not paying attention. Ticking one is a decision, so
   it is a decision the owner makes rather than one this dialog makes for
   them.

   The effect is shadow-only either way: a banned writer's comments are held
   with a note and their hearts answer normally while moving no count. Purge
   is the separate, louder act -- ninety days of this source's comments
   soft-deleted and their reactions removed, every row logged -- and it is
   off by default. */

import * as React from 'react';
import { Button, Checkbox, Input, Label, Textarea } from '@/components/coss';
import type { AdminBanKeyType, AdminBanResult, AdminCommentActor } from '@bunizao/contracts';
import { actorKeyChips, shortHandle } from './ActorStrip';
import { adminApiEndpoint } from './api';

/** What opens ticked: the keys that hold one writer. Mirrors site-api's
    `preTickedBanKeys`, which the Telegram card's Ban button uses, so the two
    doors into the ban list start from the same set. */
const PRE_TICKED: AdminBanKeyType[] = ['email', 'ip', 'fp', 'client_fp', 'domain'];

const WIDE_WARNING: Partial<Record<AdminBanKeyType, string>> = {
  ip24: 'Holds everyone on this /24 — a shared office, a carrier NAT, a campus.',
  asn: 'Holds an entire network operator. Read the insights page first.',
  email_domain: 'Holds every address at this domain, including the big ones.',
  session: 'One cookie. Cleared the moment they open a private window.',
};

const EXPIRY_CHOICES = [
  { label: 'No expiry', value: '' },
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
];

export default function BanDialog({ actor, demo, onClose, onDone }: {
  actor: AdminCommentActor;
  demo?: boolean;
  onClose: () => void;
  onDone: (result: AdminBanResult) => void;
}) {
  const chips = React.useMemo(
    () => actorKeyChips(actor).filter((chip) => chip.ban !== null),
    [actor],
  );
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(
    chips.filter((chip) => PRE_TICKED.includes(chip.ban!)).map((chip) => `${chip.ban}:${chip.value}`),
  ));
  const [note, setNote] = React.useState('');
  const [days, setDays] = React.useState('');
  const [purge, setPurge] = React.useState(false);
  const [revoke, setRevoke] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (id: string) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  async function apply(): Promise<void> {
    const keys = chips
      .filter((chip) => ticked.has(`${chip.ban}:${chip.value}`))
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
      const response = await fetch(adminApiEndpoint('/bans'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keys,
          note: note.trim() || undefined,
          expiresAt: days
            ? new Date(Date.now() + Number(days) * 86_400_000).toISOString()
            : null,
          purge,
          revokeReaderId: revoke ? actor.readerId : null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error || `HTTP ${response.status}`);
      }
      onDone(await response.json() as AdminBanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
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

        <ul className="portal-ban__keys">
          {chips.map((chip) => {
            const id = `${chip.ban}:${chip.value}`;
            const warning = WIDE_WARNING[chip.ban!];
            return (
              <li key={id} data-wide={warning ? '' : undefined}>
                <label>
                  <Checkbox checked={ticked.has(id)} onCheckedChange={() => toggle(id)} />
                  <span className="portal-actor__key-label">{chip.label}</span>
                  <span className="portal-mono">{shortHandle(chip.value)}</span>
                  {chip.banned && <span className="portal-actor__banned">already banned</span>}
                </label>
                {warning && <p className="portal-ban__warn">{warning}</p>}
              </li>
            );
          })}
        </ul>

        <Label htmlFor="ban-note">Note</Label>
        <Textarea
          id="ban-note"
          rows={2}
          value={note}
          placeholder="What this was. Read later, by you."
          onChange={(event) => setNote(event.target.value)}
        />

        <Label htmlFor="ban-expiry">Expiry</Label>
        <select
          id="ban-expiry"
          className="portal-ban__select"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        >
          {EXPIRY_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>

        <label className="portal-ban__switch">
          <Checkbox checked={purge} onCheckedChange={(next) => setPurge(next === true)} />
          <span>
            Also purge the last 90 days — comments are soft-deleted and hearts removed, each logged.
          </span>
        </label>

        {actor.readerId && (
          <label className="portal-ban__switch">
            <Checkbox checked={revoke} onCheckedChange={(next) => setRevoke(next === true)} />
            <span>This writer has a confirmed account. Ban the account too.</span>
          </label>
        )}

        {error && <div className="portal-notice" data-variant="error"><span>{error}</span></div>}

        <div className="portal-ban__acts">
          <Button size="sm" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={() => void apply()} disabled={busy}>
            {busy ? 'Working…' : `Ban ${ticked.size} key${ticked.size === 1 ? '' : 's'}`}
          </Button>
        </div>
      </div>
      <button type="button" className="portal-ban__scrim" aria-label="Close" onClick={onClose} />
    </div>
  );
}
