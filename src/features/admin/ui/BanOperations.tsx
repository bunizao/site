import * as React from 'react';
import { Button, Card, CardContent } from '@/components/coss';
import type { AdminBanOperation, AdminBanOperationListResult, AdminBanRestoreResult } from '@bunizao/contracts';
import { adminApiEndpoint } from './api';
import { shortHandle } from './ActorStrip';

export default function BanOperations({ demo = false }: { demo?: boolean }) {
  const [operations, setOperations] = React.useState<AdminBanOperation[]>([]);
  const [loading, setLoading] = React.useState(!demo);
  const [error, setError] = React.useState('');
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function load(signal?: AbortSignal): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(adminApiEndpoint('/bans/operations'), { signal });
      if (!response.ok) throw new Error(`Unable to load operation history (${response.status}).`);
      const result = await response.json() as AdminBanOperationListResult;
      if (!signal?.aborted) setOperations(result.operations);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Unable to load operation history.');
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

  async function restore(operation: AdminBanOperation): Promise<void> {
    setBusy(operation.id);
    setError('');
    try {
      const response = await fetch(adminApiEndpoint(`/bans/operations/${encodeURIComponent(operation.id)}/restore`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `Restore failed (${response.status}).`);
      }
      const result = await response.json() as AdminBanRestoreResult;
      setOperations((current) => current.map((row) => row.id === result.operation.id ? result.operation : row));
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy(null);
    }
  }

  return <Card><CardContent className="portal-card-content">
    <p>The latest 50 recorded operations. Restoring removed content and lifting a ban are separate actions. Restore does not change the ban list.</p>
    {demo && <p className="portal-list-meta">Operation history is unavailable in demo mode.</p>}
    {loading && <p role="status">Loading operation history…</p>}
    {error && <div className="portal-notice" data-variant="error" role="alert"><span>{error}</span>
      <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy !== null}>Reload history</Button>
    </div>}
    {!demo && !loading && !error && operations.length === 0 && <p>No recorded ban operations.</p>}
    {operations.map((operation) => {
      const expired = new Date(operation.restorableUntil).getTime() <= Date.now();
      const removed = operation.purged.comments + operation.purged.reactions;
      const restorable = removed > 0 && !operation.restoredAt && !expired;
      return <article className="portal-ban-operation" key={operation.id} data-operation-id={operation.id}>
        <h3>{new Date(operation.createdAt).toLocaleString()} · {operation.source}</h3>
        <p>{operation.keys.map((key) => `${key.type} ${shortHandle(key.value)}`).join(', ')}</p>
        {operation.note && <p>{operation.note}</p>}
        <p>Removed {operation.purged.comments} comments and {operation.purged.reactions} reactions.</p>
        {operation.restoredAt ? <p role="status">
          Restored {operation.restored.comments} comments and {operation.restored.reactions} reactions.
          {' '}Skipped {operation.skipped.comments} comments and {operation.skipped.reactions} reactions that could not be safely restored.
        </p> : removed > 0 && <p>{expired ? 'The restoration window has ended.' : `Restorable until ${new Date(operation.restorableUntil).toLocaleString()}.`}</p>}
        {restorable && (confirming === operation.id ? <div className="portal-ban-operation__actions">
          <p>Restore the content removed by this operation? Later changes will be preserved.</p>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirming(null)}>Cancel</Button>
          <Button size="sm" disabled={busy !== null} onClick={() => void restore(operation)}>{busy === operation.id ? 'Restoring…' : 'Confirm restore'}</Button>
        </div> : <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setConfirming(operation.id)}>Restore removed content</Button>)}
      </article>;
    })}
  </CardContent></Card>;
}
