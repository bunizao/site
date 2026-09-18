import * as React from 'react';
import { Button, Card, CardContent } from '@/components/coss';
import type { AdminBannedReader, AdminBannedReaderListResult } from '@bunizao/contracts';
import { adminApiEndpoint } from './api';

export default function RevokedAccounts({ demo = false }: { demo?: boolean }) {
  const [readers, setReaders] = React.useState<AdminBannedReader[]>([]);
  const [loading, setLoading] = React.useState(!demo);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState('');
  const [receipt, setReceipt] = React.useState('');

  async function load(signal?: AbortSignal): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(adminApiEndpoint('/bans/accounts'), { signal });
      if (!response.ok) throw new Error(`Unable to load account bans (${response.status}).`);
      const result = await response.json() as AdminBannedReaderListResult;
      if (!signal?.aborted) setReaders(result.readers);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Unable to load account bans.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  React.useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [demo]);

  async function lift(reader: AdminBannedReader): Promise<void> {
    setBusy(reader.readerId);
    setError('');
    setReceipt('');
    try {
      const response = await fetch(adminApiEndpoint(`/bans/accounts/${encodeURIComponent(reader.readerId)}`), { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `Unable to lift account ban (${response.status}).`);
      }
      setReaders((current) => current.filter((row) => row.readerId !== reader.readerId));
      setReceipt(`Account ban lifted for ${reader.email}. Source-key bans remain unchanged.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to lift account ban.');
    } finally {
      setBusy(null);
    }
  }

  return <Card><CardContent className="portal-card-content">
    <p>Account bans stay active until manually lifted. Lifting an account ban permits sign-in again; source-key bans are managed separately.</p>
    {demo && <p className="portal-list-meta">Account bans are unavailable in demo mode.</p>}
    {loading && <p role="status">Loading account bans…</p>}
    {receipt && <p role="status">{receipt}</p>}
    {error && <div className="portal-notice" data-variant="error" role="alert"><span>{error}</span>
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy !== null}>Reload accounts</Button>
    </div>}
    {!demo && !loading && !error && readers.length === 0 && <p>No banned accounts.</p>}
    {readers.length > 0 && <table className="portal-insight">
      <thead><tr><th>Account</th><th>Updated</th><th aria-label="Actions" /></tr></thead>
      <tbody>{readers.map((reader) => <tr key={reader.readerId} data-reader-id={reader.readerId}>
        <td>
          <span className="portal-insight__label">
            <strong>{reader.displayName || 'Unnamed reader'}</strong>
            <span className="portal-insight__sub">{reader.email}</span>
            <span className="portal-insight__sub portal-mono" style={{ overflowWrap: 'anywhere' }}>{reader.readerId}</span>
          </span>
        </td>
        <td>{new Date(reader.updatedAt).toLocaleString()}</td>
        <td className="portal-insight__num"><Button size="sm" variant="outline" disabled={busy !== null}
          aria-label={`Lift account ban for ${reader.email}`} onClick={() => void lift(reader)}>
          {busy === reader.readerId ? 'Lifting…' : 'Lift'}
        </Button></td>
      </tr>)}</tbody>
    </table>}
  </CardContent></Card>;
}
