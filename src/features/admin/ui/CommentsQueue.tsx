/* The comment queue: one row per comment, three verdicts, no dialog.

   The same three the ops bot's inline buttons call — see site-api
   `src/features/comments/server/owner-moderation.ts`, which both surfaces go
   through, so a comment approved on a phone and one approved here differ only
   in the audit note.

   Four decisions worth stating, because each looks like an omission:

   The body is printed WHOLE, in the writer's own line breaks, and never as
   HTML. It is the thing being judged; a clamped preview is how a link at the
   end of a long comment gets approved by somebody who never scrolled to it.
   Comment bodies carry a small Markdown subset on the public page
   (features/comments/comment-markdown.ts) and deliberately not here — the
   owner should see the source, including the raw URL a renderer would have
   turned into a friendly label.

   Acting on a row removes it from the list rather than restyling it in place.
   A queue is a stack of decisions, and what makes it usable is that it gets
   shorter. The one-line receipt above the list is where the last act went,
   and it names what happened so a mis-press is visible immediately.

   No comment id is printed. The timestamp is the row's permalink, which is
   the anchor the ops bot's Review button lands on; a column of ULIDs down the
   queue is noise the owner reads past, and the one time the id is wanted it
   is in the address bar.

   The exit is CSS, not framer-motion, even though the package is in the tree.
   Every other portal surface animates through the `--portal-dur-*` tokens and
   plain transitions, and pulling ~40kb of runtime into an admin page to move
   one row 8px would buy nothing the tokens do not already do. */

import * as React from 'react';
import { Badge, Button, Card, CardContent } from '@/components/coss';
import { Check, EyeOff, History, Inbox, ShieldAlert, Trash2 } from 'lucide-react';
import { initials, seedHue } from '@/features/comments/identity';
import type { AdminBanResult, AdminCommentActor } from '@bunizao/contracts';
import type { PortalComment, PortalCommentStatus } from '@/features/admin/server/portal-client';
import ActorStrip from './ActorStrip';
import IdentityBadge, { IDENTITY_LABELS, identityStatus, type IdentityStatus } from './IdentityBadge';
import BanDialog from './BanDialog';
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

/** How long the row is given to leave before it is dropped from state.
    Deliberately a little longer than the 130ms transition on `.portal-comment`
    (`--portal-dur-fast`): a timeout that merely equalled it would race the last
    frame and show a half-faded row snapping away. */
const EXIT_MS = 160;

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function CommentRow({
  comment,
  busy,
  demo,
  leaving,
  onAct,
  onBan,
}: {
  comment: PortalComment;
  busy: string | null;
  demo: boolean;
  leaving: boolean;
  onAct: (comment: PortalComment, action: Action) => void;
  onBan: (actor: AdminCommentActor) => void;
}) {
  const flagged = comment.moderationReason && comment.moderationReason !== 'ok'
    ? comment.moderationReason
    : null;
  // Three tones, three different things: the model rejected it, the model held
  // it, or there was no model verdict and the fail-closed default caught it.
  const verdictTone = comment.status === 'rejected'
    ? 'danger'
    : comment.moderationModel
      ? 'warning'
      : 'neutral';
  const actProps = {
    disabled: demo || busy !== null,
    title: demo ? 'Demo data — the site-api binding is unavailable in local dev.' : undefined,
  };
  const working = busy === comment.id;

  return (
    <article className="portal-comment" id={comment.id} data-leaving={leaving ? '' : undefined}>
      <span
        className="portal-comment__face"
        style={{ '--seed-hue': seedHue(comment.author) } as React.CSSProperties}
        aria-hidden="true"
      >
        {initials(comment.author)}
      </span>

      <div className="portal-comment__head">
        <strong className="portal-comment__name">{comment.author}</strong>
        <IdentityBadge actor={comment.actor} />
        <Badge variant={STATUS_VARIANT[comment.status]} size="sm">{comment.status}</Badge>
        {flagged && <Badge variant="destructive" size="sm">{flagged}</Badge>}
        <a className="portal-comment__when" href={`#${comment.id}`} title={comment.id}>
          {timeAgo(comment.createdAt)}
          {comment.country ? ` · ${comment.country}` : ''}
          {comment.editedAt ? ' · edited' : ''}
        </a>
      </div>

      {/* Which post, because the same sentence reads differently under a
          tutorial and under a personal note. Linked when the registry knew the
          slug, plain when it did not. */}
      <div className="portal-comment__sub">
        {comment.parentId ? 'reply on ' : 'on '}
        {comment.postSlug ? (
          <a href={`/blog/${comment.postSlug}/`} target="_blank" rel="noreferrer">
            {comment.postTitle ?? comment.postSlug}
          </a>
        ) : (
          <span className="portal-mono">{comment.postId}</span>
        )}
      </div>

      <p className="portal-comment__body">{comment.body}</p>

      {/* Where it came from, under the words it is judged on rather than
          above them: the body decides most rows on its own, and the strip is
          for the ones it does not. */}
      <ActorStrip actor={comment.actor} onBan={onBan} showIdentityBadge={false} />

      {comment.moderationNote && (
        <div className="portal-comment__verdict" data-tone={verdictTone}>
          <ShieldAlert size={13} strokeWidth={1.5} />
          <span>
            {comment.moderationNote}{' '}
            <span className="portal-comment__model">
              {comment.moderationModel ? `· ${comment.moderationModel}` : '· no model verdict'}
            </span>
          </span>
        </div>
      )}

      <div className="portal-comment__acts">
        {/* Rejected rows are approvable too: a gate that rejects without
            asking anyone needs a way back for the reader it got wrong. */}
        {(comment.status === 'held' || comment.status === 'rejected') && (
          <Button size="sm" {...actProps} onClick={() => onAct(comment, 'approve')}>
            <Check size={14} /> {working ? 'Working…' : 'Approve'}
          </Button>
        )}
        {comment.status === 'published' && (
          <Button size="sm" variant="outline" {...actProps} onClick={() => onAct(comment, 'hide')}>
            <EyeOff size={14} /> {working ? 'Working…' : 'Hide'}
          </Button>
        )}
        {comment.status !== 'deleted' && (
          <Button size="sm" variant="destructive-outline" data-act="delete" {...actProps} onClick={() => onAct(comment, 'delete')}>
            <Trash2 size={14} /> Delete
          </Button>
        )}
        {/* The verdict printed above is only ever the latest one -- the row
            keeps a single set of moderation columns and overwrites them on
            every decision. This is the way to the rest of it. */}
        <a className="portal-comment__history" href={`/dev/portal/activity?family=all&targetId=${encodeURIComponent(comment.id)}`}>
          <History size={13} strokeWidth={1.5} /> History
        </a>
      </div>
    </article>
  );
}

export default function CommentsQueue({ initialComments, status, demo = false }: CommentsQueueProps) {
  const [comments, setComments] = React.useState(initialComments);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [leaving, setLeaving] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [banning, setBanning] = React.useState<AdminCommentActor | null>(null);
  const [identity, setIdentity] = React.useState<IdentityStatus | 'all'>('all');
  const visible = identity === 'all' ? comments : comments.filter((comment) => identityStatus(comment.actor) === identity);

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
      setReceipt(`${comment.author}'s comment ${DONE_LABEL[action]}.`);
      setLeaving(comment.id);
      window.setTimeout(() => {
        setComments((rows) => rows.filter((row) => row.id !== comment.id));
        setLeaving(null);
      }, EXIT_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown');
    } finally {
      setBusy(null);
    }
  }, [demo]);

  const rows = visible.length === 0 ? (
    <div className="portal-empty">
      <span className="portal-empty-icon"><Inbox size={18} strokeWidth={1.5} /></span>
      <p className="portal-empty-title">
        {identity !== 'all' ? 'No comments match this identity on this page' : status === 'held' ? 'Nothing is waiting for review' : 'No comments match this filter'}
      </p>
      <p className="portal-empty-hint">
        {identity !== 'all' ? 'Choose another identity filter or change the status above.' : status === 'held'
          ? 'Held comments land here, and in Telegram, the moment the automatic pass is unsure.'
          : 'Try another status above.'}
      </p>
    </div>
  ) : (
    visible.map((comment) => (
      <CommentRow
        key={comment.id}
        comment={comment}
        busy={busy}
        demo={demo}
        leaving={leaving === comment.id}
        onAct={(target, action) => void act(target, action)}
        onBan={setBanning}
      />
    ))
  );

  return (
    <Card>
      <CardContent className="portal-card-content" style={{ paddingTop: 18 }}>
        <div className="portal-identity-filter">
          <label htmlFor="comment-identity">Identity on this page</label>
          <select id="comment-identity" value={identity} onChange={(event) => setIdentity(event.target.value as IdentityStatus | 'all')}>
            <option value="all">All identities ({comments.length})</option>
            {Object.entries(IDENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label} ({comments.filter((comment) => identityStatus(comment.actor) === key).length})</option>
            ))}
          </select>
          <span role="status">Showing {visible.length} of {comments.length} loaded comments</span>
        </div>
        <p className="portal-list-meta">Verification describes the session at writing, not trustworthiness or current account access. Claims link ownership later.</p>
        {receipt && (
          <p className="portal-comment-receipt">
            <Check size={13} strokeWidth={1.5} />
            {receipt}
          </p>
        )}
        {error && (
          <div className="portal-notice" data-variant="error">
            <ShieldAlert size={14} strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}
        {rows}
      </CardContent>
      {/* A ban does not change this page: the rows it will hold have not been
          written yet, and the ones it purged are gone on the next load. The
          receipt is the whole feedback, and it says what actually happened. */}
      {banning && (
        <BanDialog
          actor={banning}
          demo={demo}
          onClose={() => setBanning(null)}
          onDone={(result: AdminBanResult) => {
            setBanning(null);
            const purged = result.purged.comments + result.purged.reactions;
            setReceipt(
              `${result.bans.length} key${result.bans.length === 1 ? '' : 's'} banned`
              + (purged > 0 ? `, ${result.purged.comments} comments and ${result.purged.reactions} hearts purged.` : '.'),
            );
          }}
        />
      )}
    </Card>
  );
}
