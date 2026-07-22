import * as React from 'react';
import type { NotifyGateDecision, NotifyGateStatus } from '@bunizao/contracts';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/coss';
import { adminApiEndpoint } from './api';

interface GateStatusCardProps {
  initialStatus: NotifyGateStatus | null;
}

const DECISION_LABELS: Record<NotifyGateDecision, string> = {
  digest: 'Send as one digest',
  individual: 'Send individually',
  drop: 'Drop, wait for next digest',
};

export default function GateStatusCard({ initialStatus }: GateStatusCardProps) {
  const [status, setStatus] = React.useState<NotifyGateStatus | null>(initialStatus);
  const [releasing, setReleasing] = React.useState<NotifyGateDecision | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRelease, setLastRelease] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch(adminApiEndpoint('/notify-gate'));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus(await response.json() as NotifyGateStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    }
  }, []);

  const release = React.useCallback(async (decision: NotifyGateDecision) => {
    setReleasing(decision);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint('/notify-gate/release'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error || `HTTP ${response.status}`);
      }
      const result = await response.json() as { releasedPostIds: string[] };
      setLastRelease(`${DECISION_LABELS[decision]} · ${result.releasedPostIds.length} posts`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setReleasing(null);
    }
  }, [refresh]);

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="portal-card-title">Flood gate</CardTitle>
          <CardDescription>
            Gate status unavailable — the notify-gate endpoint is not deployed yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const held = status.state === 'held';

  return (
    <Card>
      <CardHeader className="portal-stat-header">
        <div>
          <CardTitle className="portal-card-title">Flood gate</CardTitle>
          <CardDescription>
            Holds immediate mood emails when ≥{status.config.thresholdCount} posts land within{' '}
            {status.config.thresholdWindowMinutes} min. Auto digest after {status.config.autoReleaseAfterHours}h.
          </CardDescription>
        </div>
        <Badge variant={held ? 'destructive' : 'success'}>
          {held ? `held (${status.heldPostIds.length} posts)` : 'open'}
        </Badge>
      </CardHeader>
      <CardContent className="portal-card-content">
        {held ? (
          <div className="portal-stack" style={{ gap: 12 }}>
            <div className="portal-list-meta">
              Held posts: <span className="portal-mono">{status.heldPostIds.join(', ') || '—'}</span>
              {status.heldSince ? ` · since ${new Date(status.heldSince).toLocaleString()}` : null}
            </div>
            <div className="portal-badge-row">
              {(Object.keys(DECISION_LABELS) as NotifyGateDecision[]).map((decision) => (
                <Button
                  key={decision}
                  size="sm"
                  variant={decision === 'digest' ? 'default' : 'outline'}
                  disabled={releasing !== null}
                  onClick={() => void release(decision)}
                >
                  {releasing === decision ? 'Releasing…' : DECISION_LABELS[decision]}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="portal-list-meta">
            {status.recentDispatchCount} immediate dispatch{status.recentDispatchCount === 1 ? '' : 'es'} in the
            current window.
            {lastRelease ? ` Last release: ${lastRelease}.` : ''}
          </div>
        )}
        {error && (
          <div className="portal-list-meta" data-spacing="top" style={{ color: 'hsl(var(--portal-danger))' }}>
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
