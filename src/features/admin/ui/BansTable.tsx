/* The ban list, and the only place a ban is lifted.

   Sorted by what each key has actually caught, because that is the number
   that says whether a ban is still doing anything. A key with zero hits and
   no expiry is either a source that gave up or a ban that was never right,
   and both are worth a second look.

   Lifting is immediate and silent, like the ban itself: the writer was never
   told they were held, so there is nothing to un-tell. */

import * as React from 'react';
import { Badge, Button, Card, CardContent } from '@/components/coss';
import { ShieldOff, Inbox } from 'lucide-react';
import type { AdminBan } from '@bunizao/contracts';
import { shortHandle, sourceHref } from './ActorStrip';
import { adminApiEndpoint } from './api';

function when(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  return `${days}d ago`;
}

function expiry(ban: AdminBan): string {
  if (!ban.expiresAt) return 'no expiry';
  const days = Math.round((new Date(ban.expiresAt).getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? 'expired' : `${days}d left`;
}

export default function BansTable({ initialBans, demo = false }: { initialBans: AdminBan[]; demo?: boolean }) {
  const [bans, setBans] = React.useState(initialBans);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function lift(ban: AdminBan): Promise<void> {
    const id = `${ban.keyType}:${ban.keyValue}`;
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(
        adminApiEndpoint(`/bans/${encodeURIComponent(ban.keyType)}/${encodeURIComponent(ban.keyValue)}`),
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setBans((rows) => rows.filter((row) => `${row.keyType}:${row.keyValue}` !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setBusy(null);
    }
  }

  if (bans.length === 0) {
    return (
      <Card>
        <CardContent className="portal-card-content">
          <div className="portal-empty">
            <span className="portal-empty-icon"><Inbox size={18} strokeWidth={1.5} /></span>
            <p className="portal-empty-title">Nobody is banned</p>
            <p className="portal-empty-hint">Bans start from a comment's actor strip, or from its Telegram card.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="portal-card-content" style={{ paddingTop: 18 }}>
        <p>Lifting a ban allows future activity. Restore previously removed content separately in operation history.</p>
        {error && <div className="portal-notice" data-variant="error"><span>{error}</span></div>}
        <table className="portal-insight">
          <thead>
            <tr>
              <th>key</th>
              <th>note</th>
              <th className="portal-insight__num">hits</th>
              <th className="portal-insight__num">added</th>
              <th className="portal-insight__num" />
            </tr>
          </thead>
          <tbody>
            {[...bans].sort((a, b) => b.hits - a.hits).map((ban) => (
              <tr key={`${ban.keyType}:${ban.keyValue}`}>
                <td>
                  <span className="portal-insight__label">
                    <a href={sourceHref(ban.keyType, ban.keyValue)}>
                      <span className="portal-actor__key-label">{ban.keyType}</span>{' '}
                      <span className="portal-mono">{shortHandle(ban.keyValue)}</span>
                    </a>
                    <span className="portal-insight__sub">{expiry(ban)} · from {ban.source}</span>
                  </span>
                </td>
                <td><span className="portal-insight__label">{ban.note ?? <em>no note</em>}</span></td>
                <td className="portal-insight__num tabular-nums">
                  {ban.hits > 0 ? <Badge variant="destructive" size="sm">{ban.hits}</Badge> : '0'}
                </td>
                <td className="portal-insight__num tabular-nums">{when(ban.createdAt)}</td>
                <td className="portal-insight__num">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={demo || busy !== null}
                    onClick={() => void lift(ban)}
                  >
                    <ShieldOff size={13} /> Lift
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
