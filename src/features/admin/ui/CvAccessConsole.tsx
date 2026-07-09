import * as React from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { adminApiEndpoint } from './api';
import type {
  PortalCvAccessRequest,
  PortalCvAccessRequestStatus,
  PortalCvPdfCache,
} from '../server/portal-client';

interface Props {
  initialRequests: PortalCvAccessRequest[];
  initialPdfCache: PortalCvPdfCache;
  initialError?: string | null;
}

type ActionKind = 'approve' | 'reject';

interface PendingAction {
  kind: ActionKind;
  request: PortalCvAccessRequest;
}

const STATUS_VARIANTS: Record<PortalCvAccessRequestStatus, 'success' | 'warning' | 'secondary'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'secondary',
};
const CV_PORTAL_API_ROOT = '/dev/portal/cv/api';

function cvPortalApiEndpoint(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${CV_PORTAL_API_ROOT}${cleanPath}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function ageLabel(value: string): string {
  const elapsedMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return formatDate(value);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  if (payload && typeof payload === 'object' && 'error' in payload) {
    return String((payload as { error?: unknown }).error);
  }
  return `HTTP ${response.status}`;
}

export default function CvAccessConsole({ initialRequests, initialPdfCache, initialError = null }: Props) {
  const [requests, setRequests] = React.useState(initialRequests);
  const [pdfCache, setPdfCache] = React.useState(initialPdfCache);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError);
  const [pendingAction, setPendingAction] = React.useState<PendingAction | null>(null);
  const [actingId, setActingId] = React.useState<string | null>(null);
  const [ownerLink, setOwnerLink] = React.useState<string | null>(null);
  const [minting, setMinting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const pending = requests.filter((request) => request.status === 'pending');
  const history = requests.filter((request) => request.status !== 'pending').slice(0, 24);

  const loadRequests = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint('/cv/requests'));
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { requests: PortalCvAccessRequest[] };
      setRequests(data.requests);
      const cacheResponse = await fetch(adminApiEndpoint('/cv/pdf-cache'));
      if (cacheResponse.ok) {
        const cacheData = (await cacheResponse.json()) as { pdfCache: PortalCvPdfCache };
        setPdfCache(cacheData.pdfCache);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setLoading(false);
    }
  }, []);

  const performAction = React.useCallback(async () => {
    if (!pendingAction) return;

    setActingId(pendingAction.request.id);
    setError(null);
    try {
      const response = await fetch(
        cvPortalApiEndpoint(`/requests/${encodeURIComponent(pendingAction.request.id)}/${pendingAction.kind}`),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { request: PortalCvAccessRequest };
      setRequests((current) => current.map((item) => (
        item.id === data.request.id ? data.request : item
      )));
      setPendingAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setActingId(null);
    }
  }, [pendingAction]);

  const mintOwnerLink = React.useCallback(async () => {
    setMinting(true);
    setCopied(false);
    setError(null);
    try {
      const response = await fetch(cvPortalApiEndpoint('/owner-link'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as { url: string };
      setOwnerLink(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setMinting(false);
    }
  }, []);

  const copyOwnerLink = React.useCallback(async () => {
    if (!ownerLink) return;
    await navigator.clipboard.writeText(ownerLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [ownerLink]);

  return (
    <div className="grid gap-5">
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base">Pending requests</CardTitle>
              <CardDescription>{pending.length} waiting for a decision.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadRequests} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {loading && requests.length === 0 ? (
              <div className="grid gap-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : pending.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No pending CV access requests.
              </div>
            ) : (
              <RequestTable
                requests={pending}
                showDecisionAt={false}
                actingId={actingId}
                onApprove={(request) => setPendingAction({ kind: 'approve', request })}
                onReject={(request) => setPendingAction({ kind: 'reject', request })}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="size-4" />
              Owner link
            </CardTitle>
            <CardDescription>Minting a new link invalidates the previous owner link.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={mintOwnerLink} disabled={minting}>
              <Link2 />
              {minting ? 'Minting' : 'Mint new link'}
            </Button>
            {ownerLink && (
              <div className="grid gap-3 rounded-lg border border-border bg-background p-3">
                <div className="break-all font-mono text-xs text-muted-foreground">{ownerLink}</div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copyOwnerLink}>
                    <Copy />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={ownerLink} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Open
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <PdfCacheCard pdfCache={pdfCache} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decided history</CardTitle>
          <CardDescription>The most recent approved and rejected requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No decided requests yet.
            </div>
          ) : (
            <RequestTable requests={history} showDecisionAt actingId={actingId} />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.kind === 'approve' ? 'Approve CV access?' : 'Reject CV access?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.kind === 'approve'
                ? 'Approving sends the requester a full CV magic link immediately.'
                : 'Rejecting closes the request without sending a link.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={performAction}>
              {pendingAction?.kind === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PdfCacheCard({ pdfCache }: { pdfCache: PortalCvPdfCache }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">PDF cache</CardTitle>
        <CardDescription>
          {pdfCache.available
            ? 'Current R2 keys for generated CV PDFs.'
            : 'R2 cache binding is not available in this environment.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {pdfCache.error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {pdfCache.error}
          </div>
        )}
        {pdfCache.keys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No cache keys reported.
          </div>
        ) : (
          <div className="grid gap-2">
            {pdfCache.keys.map((entry) => (
              <div key={entry.lang} className="grid gap-2 rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium uppercase">{entry.lang}</span>
                  <Badge variant={entry.cached ? 'success' : 'secondary'}>
                    {entry.cached ? 'Cached' : 'Missing'}
                  </Badge>
                </div>
                <code className="break-all rounded bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
                  {entry.key}
                </code>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RequestTable({
  requests,
  showDecisionAt,
  actingId,
  onApprove,
  onReject,
}: {
  requests: PortalCvAccessRequest[];
  showDecisionAt: boolean;
  actingId: string | null;
  onApprove?: (request: PortalCvAccessRequest) => void;
  onReject?: (request: PortalCvAccessRequest) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead>Lang</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>{showDecisionAt ? 'Decided' : 'Age'}</TableHead>
            {(onApprove || onReject) && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell className="font-medium">{request.email}</TableCell>
              <TableCell className="max-w-[420px]">
                <span className="line-clamp-2 text-muted-foreground">{request.intent}</span>
              </TableCell>
              <TableCell className="uppercase text-muted-foreground">{request.lang}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[request.status]}>{request.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {showDecisionAt ? formatDate(request.decidedAt) : ageLabel(request.createdAt)}
              </TableCell>
              {(onApprove || onReject) && (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {onApprove && (
                      <Button
                        size="sm"
                        onClick={() => onApprove(request)}
                        disabled={actingId === request.id}
                      >
                        <Check />
                        Approve
                      </Button>
                    )}
                    {onReject && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReject(request)}
                        disabled={actingId === request.id}
                      >
                        <X />
                        Reject
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
