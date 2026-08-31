/* The comment queue: one card per comment, three verdicts, no dialog.

   The same three the ops bot's inline buttons call — see site-api
   `src/features/comments/server/owner-moderation.ts`, which both surfaces go
   through, so a comment approved on a phone and one approved here differ only
   in the audit note.

   Two decisions worth stating, because both look like omissions:

   The body is printed WHOLE, in the reader's own line breaks, and never as
   HTML. It is the thing being judged; a clamped preview is how a link at the
   end of a long comment gets approved by somebody who never scrolled to it.
   Comment bodies carry a small Markdown subset on the public page
   (features/comments/comment-markdown.ts) and deliberately not here — the
   owner should see the source, including the raw URL a renderer would have
   turned into a friendly label.

   Acting on a row removes it from the list rather than restyling it in place.
   A queue is a stack of decisions, and the thing that makes it usable is that
   it gets shorter. The one-line receipt at the top is where the last act went,
   and it names what happened so a mis-press is visible immediately. */

import * as React from 'react';
import { Badge, Button, Card, CardContent } from '@/components/coss';
import { Check, EyeOff, ShieldAlert, Trash2, UserCheck } from 'lucide-react';
import type { PortalComment, PortalCommentStatus } from '@/features/admin/server/portal-client';
import { adminApiEndpoint } from './api';

type Action = 'approve' | 'hide' | 'delete';

interface CommentsQueueProps {
  initialComments: PortalComment[];
  /** Which filter produced this list; decides which buttons a row offers. */
  status: PortalCommentStatus | 'all';
  /** Local-dev fixture mode: the buttons would post into nothing. */
  demo?: boolean;
}

const DONE_LABEL: Record<Action, string> = {
  approve: 'published',
  hide: 'hidden',
  delete: 'deleted',
};

const STATUS_VARIANT: Record<PortalCommentStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  published: 'success',
  held: 'warning',
  rejected: 'destructive',
  deleted: 'secondary',
};

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function CommentsQueue({ initialComments, status, demo = false }: CommentsQueueProps) {
  const [comments, setComments] = React.useState(initialComments);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const act = React.useCallback(async (comment: PortalComment, action: Action) => {
    // The page already says it is showing a fixture; the buttons are disabled
    // to match, and this is the belt to that suspenders.
    if (demo) return;
    setBusy(comment.id);
    setError(null);
    try {
      const response = await fetch(adminApiEndpoint(`/comments/${encodeURIComponent(comment.id)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        // 409 is the queue having moved underneath this page — the comment was
        // already acted on, most likely from Telegram. Say that, rather than
        // printing a status code at somebody who did nothing wrong.
        throw new Error(response.status === 409
          ? 'Already handled somewhere else. Reload to see where it went.'
          : (payload as { error?: string }).error || `HTTP ${response.status}`);
      }
      setComments((rows) => rows.filter((row) => row.id !== comment.id));
      setReceipt(`${comment.author}'s comment ${DONE_LABEL[action]}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setBusy(null);
    }
  }, [demo]);

  const actProps = {
    disabled: demo || busy !== null,
    title: demo ? 'Demo data — the site-api binding is unavailable in local dev.' : undefined,
  };

  if (!comments.length) {
    return (
      <div className="portal-list-meta">
        {receipt ?? (status === 'held' ? 'Nothing is waiting for review.' : 'No comments match this filter.')}
      </div>
    );
  }

  return (
    <div className="portal-stack" style={{ gap: 12 }}>
      {receipt && <div className="portal-list-meta">{receipt}</div>}
      {error && (
        <div className="portal-notice" data-variant="error">
          <ShieldAlert size={14} />
          <span>{error}</span>
        </div>
      )}

      {comments.map((comment) => (
        <Card key={comment.id} id={comment.id}>
          <CardContent className="portal-card-content">
            <div className="portal-stack" style={{ gap: 10 }}>
              <div className="portal-badge-row">
                <strong>{comment.author}</strong>
                {comment.verified && (
                  <Badge variant="secondary" title="Confirmed email at the time of writing">
                    <UserCheck size={12} /> verified
                  </Badge>
                )}
                <Badge variant={STATUS_VARIANT[comment.status]}>{comment.status}</Badge>
                {comment.moderationReason && comment.moderationReason !== 'ok' && (
                  <Badge variant="destructive">{comment.moderationReason}</Badge>
                )}
                {comment.parentId && <span className="portal-list-meta">reply</span>}
                <span className="portal-list-meta">
                  {timeAgo(comment.createdAt)}
                  {comment.country ? ` · ${comment.country}` : ''}
                  {comment.editedAt ? ' · edited' : ''}
                </span>
              </div>

              {/* Which post, because the same sentence reads differently under
                  a tutorial and under a personal note. Linked when the
                  registry knew the slug, plain text when it did not. */}
              <div className="portal-list-meta">
                {comment.postSlug ? (
                  <a href={`/blog/${comment.postSlug}/`} target="_blank" rel="noreferrer">
                    {comment.postTitle ?? comment.postSlug}
                  </a>
                ) : (
                  <span className="portal-mono">{comment.postId}</span>
                )}
              </div>

              {/* `pre-wrap`: the writer's own line breaks are part of what is
                  being judged, and a body collapsed to one paragraph reads as
                  a different comment than the one that will be published. */}
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{comment.body}</p>

              {comment.moderationNote && (
                <div className="portal-list-meta">
                  {comment.moderationNote}
                  {comment.moderationModel ? ` · ${comment.moderationModel}` : ' · no model verdict'}
                </div>
              )}

              <div className="portal-badge-row">
                {comment.status === 'held' && (
                  <Button size="sm" {...actProps} onClick={() => void act(comment, 'approve')}>
                    <Check size={14} /> {busy === comment.id ? 'Working…' : 'Approve'}
                  </Button>
                )}
                {comment.status === 'published' && (
                  <Button size="sm" variant="outline" {...actProps} onClick={() => void act(comment, 'hide')}>
                    <EyeOff size={14} /> Hide
                  </Button>
                )}
                {comment.status !== 'deleted' && (
                  <Button size="sm" variant="outline" {...actProps} onClick={() => void act(comment, 'delete')}>
                    <Trash2 size={14} /> Delete
                  </Button>
                )}
                <span className="portal-list-meta portal-mono">{comment.id}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
