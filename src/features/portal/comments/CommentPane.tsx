import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { commentAnchorToken } from '@bunizao/contracts/comments';
import {
  BadgeCheck,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  ExternalLink,
  EyeOff,
  Link2,
  MailQuestion,
  MoreHorizontal,
  ShieldAlert,
  ShieldX,
  Trash2,
  Users,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert';
import { Badge } from '@/components/coss/badge';
import { Button } from '@/components/coss/button';
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/coss/collapsible';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/coss/menu';
import { Meter, MeterIndicator, MeterTrack } from '@/components/coss/meter';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/coss/tooltip';
import { toastManager } from '@/components/coss/toast';
import { cn } from '@/lib/utils';
import type { PortalActivity, PortalComment } from '@/features/admin/server/portal-client';
import { apiGet } from '../app/api';
import { Link, href } from '../app/router';
import { STATUS_LABELS, type Verdict } from './data';
import { WriterAvatar } from './CommentRow';
import {
  absoluteTime,
  actorKeys,
  commentPublicUrl,
  identityDetail,
  identityStatus,
  IDENTITY_LABELS,
  relativeTime,
  shortHandle,
  whyHere,
} from './model';

const STATUS_BADGE = {
  held: 'warning',
  published: 'success',
  rejected: 'error',
  deleted: 'secondary',
} as const;

function useAnchorToken(id: string): string | null {
  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    void commentAnchorToken(id).then((value) => live && setToken(value));
    return () => {
      live = false;
    };
  }, [id]);
  return token;
}

export function pivotHref(source: string, value: string): string {
  const params = new URLSearchParams({ status: 'all', key: source, value });
  return `/comments?${params}`;
}

function ActionButton({ label, keys, className, ...props }: React.ComponentProps<typeof Button> & { label: string; keys: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button className={className} aria-keyshortcuts={keys.toUpperCase()} {...props} />} />
      <TooltipPopup className="flex items-center gap-2">
        {label}
        <Kbd>{keys.toUpperCase()}</Kbd>
      </TooltipPopup>
    </Tooltip>
  );
}

export interface CommentPaneProps {
  comment: PortalComment;
  position: { index: number; total: number } | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onAct: (comment: PortalComment, verdict: Verdict) => void;
  onBan: (comment: PortalComment) => void;
  /** Hides the prev/next pager, which the mobile drawer replaces with swipes. */
  compact?: boolean;
}

export function CommentPane({ comment, position, onPrev, onNext, onAct, onBan, compact = false }: CommentPaneProps) {
  const why = whyHere(comment);
  const token = useAnchorToken(comment.id);
  const publicUrl = commentPublicUrl(comment, token);
  const identity = identityStatus(comment.actor);
  const canApprove = comment.status === 'held' || comment.status === 'rejected';
  const canUnpublish = comment.status === 'published';
  const canDelete = comment.status !== 'deleted';

  return (
    <article className="flex min-h-0 flex-col" aria-labelledby={`pane-title-${comment.id}`}>
      <header className="flex items-center gap-3 border-b px-5 py-3">
        <WriterAvatar name={comment.author} className="size-9 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 id={`pane-title-${comment.id}`} className="flex items-center gap-1.5 font-semibold text-base">
            <span className="truncate">{comment.author}</span>
            {identity === 'verified' && <BadgeCheck className="size-4 shrink-0 text-success" aria-label="Verified" />}
          </h2>
          <p className="truncate text-muted-foreground text-xs">
            <time dateTime={comment.createdAt} title={absoluteTime(comment.createdAt)}>{relativeTime(comment.createdAt)} ago</time>
            {' · '}
            {IDENTITY_LABELS[identity]}
            {comment.actor.country ? ` · ${[comment.actor.city, comment.actor.country].filter(Boolean).join(', ')}` : ''}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[comment.status]}>{STATUS_LABELS[comment.status]}</Badge>
        {!compact && position && (
          <div className="flex items-center gap-1">
            <span className="me-1 text-muted-foreground text-xs tabular-nums">
              {position.index + 1} / {position.total}
            </span>
            <Button size="icon-sm" variant="ghost" aria-label="Previous comment (K)" disabled={!onPrev} onClick={onPrev ?? undefined}>
              <ChevronUp />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Next comment (J)" disabled={!onNext} onClick={onNext ?? undefined}>
              <ChevronDown />
            </Button>
          </div>
        )}
      </header>

      {/* On a phone the verdicts sit at the bottom, under the thumb. */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 px-5 py-2.5',
          compact ? 'order-last border-t pb-[max(env(safe-area-inset-bottom),0.625rem)]' : 'border-b',
        )}
      >
        {canApprove && (
          <ActionButton label="Approve and publish" keys="a" size="sm" onClick={() => onAct(comment, 'approve')}>
            <Check />
            Approve
          </ActionButton>
        )}
        {canUnpublish && (
          <ActionButton label="Unpublish and move back to Held" keys="u" size="sm" variant="outline" onClick={() => onAct(comment, 'hide')}>
            <EyeOff />
            Unpublish
          </ActionButton>
        )}
        {canDelete && (
          <ActionButton label="Delete, with 6 seconds to undo" keys="d" size="sm" variant="destructive-outline" onClick={() => onAct(comment, 'delete')}>
            <Trash2 />
            Delete
          </ActionButton>
        )}
        <ActionButton label="Ban the writer" keys="b" size="sm" variant="ghost" onClick={() => onBan(comment)}>
          <Ban />
          Ban…
        </ActionButton>
        <Menu>
          <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="More actions" className="ms-auto" />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              onClick={() => {
                void navigator.clipboard.writeText(new URL(href(`/comments?status=all&c=${comment.id}`), location.origin).toString());
                toastManager.add({ title: 'Link copied', timeout: 2000 });
              }}
            >
              <Link2 />
              Copy portal link
            </MenuItem>
            {publicUrl && (
              <MenuItem render={<a href={publicUrl} target="_blank" rel="noreferrer" />}>
                <ExternalLink />
                Open on the site
              </MenuItem>
            )}
            <MenuSeparator />
            {comment.actor.keys.session && (
              <MenuItem render={<Link to={pivotHref('session', comment.actor.keys.session)} />}>
                <Users />
                Everything from this session
              </MenuItem>
            )}
            <MenuItem render={<Link to={`/comments/posts/${encodeURIComponent(comment.postId)}`} />}>
              <CornerDownRight />
              The whole thread on this post
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        {why && (
          <Alert variant={why.tone === 'danger' ? 'error' : why.tone}>
            {why.tone === 'info' ? <MailQuestion /> : why.tone === 'danger' ? <ShieldX /> : <ShieldAlert />}
            <AlertTitle>{why.title}</AlertTitle>
            {(why.detail || why.score !== null) && (
              <AlertDescription className="flex flex-col gap-2">
                {why.detail && <p>{why.detail}</p>}
                {why.score !== null && (
                  <div className="flex flex-col gap-1.5">
                    <Meter value={why.score} max={100} aria-label="Writer risk score" className="max-w-56">
                      <MeterTrack className="h-1.5">
                        <MeterIndicator className={cn(why.score >= 70 ? 'bg-destructive' : why.score >= 40 ? 'bg-warning' : 'bg-info')} />
                      </MeterTrack>
                    </Meter>
                    <p className="text-xs">
                      Risk {why.score}/100
                      {why.signals.length > 0 && ` from ${why.signals.join(', ')}`}
                    </p>
                  </div>
                )}
              </AlertDescription>
            )}
          </Alert>
        )}

        <section aria-label="Comment">
          {comment.parentId && (
            <p className="mb-2 inline-flex items-center gap-1.5 text-muted-foreground text-xs">
              <CornerDownRight className="size-3.5" aria-hidden />
              A reply to another comment
            </p>
          )}
          <div className="whitespace-pre-wrap break-words text-[0.9375rem] text-foreground leading-relaxed">{comment.body}</div>
          <p className="mt-3 text-muted-foreground text-xs">
            On{' '}
            {publicUrl ? (
              <a className="text-foreground underline-offset-2 hover:underline" href={publicUrl} target="_blank" rel="noreferrer">
                {comment.postTitle ?? comment.postSlug ?? comment.postId}
              </a>
            ) : (
              <span className="text-foreground">{comment.postTitle ?? comment.postId}</span>
            )}
            {comment.editedAt && ` · edited ${relativeTime(comment.editedAt)} ago`}
          </p>
        </section>

        <WriterSection comment={comment} />
        <KeysSection comment={comment} />
        <HistorySection commentId={comment.id} />
      </div>
    </article>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">{children}</h3>;
}

function WriterSection({ comment }: { comment: PortalComment }) {
  const actor = comment.actor;
  const session = actor.cluster.session;
  const device = [actor.browser, actor.os].filter(Boolean).join(' on ');
  const dwell = actor.behaviour.dwellMs;
  return (
    <section>
      <SectionTitle>Writer</SectionTitle>
      <dl className="divide-y divide-border/60">
        <Fact label="Identity">{identityDetail(actor)}</Fact>
        <Fact label="Email">{actor.email}</Fact>
        <Fact label="Location">{[actor.city, actor.country].filter(Boolean).join(', ') || null}</Fact>
        <Fact label="Network">{actor.asOrg ? `${actor.asOrg}${actor.asn ? ` (AS${actor.asn})` : ''}` : null}</Fact>
        <Fact label="Device">{device || null}</Fact>
        <Fact label="Time on page">{dwell ? (dwell < 60_000 ? `${Math.round(dwell / 1000)}s` : `${Math.round(dwell / 60_000)} min`) : null}</Fact>
        <Fact label="This session">
          {session && session.comments > 0 && actor.keys.session ? (
            <Link className="underline-offset-2 hover:underline" to={pivotHref('session', actor.keys.session)}>
              {session.comments} other {session.comments === 1 ? 'comment' : 'comments'}
              {session.held > 0 ? `, ${session.held} held` : ''}
            </Link>
          ) : (
            'No other comments'
          )}
        </Fact>
      </dl>
    </section>
  );
}

function KeysSection({ comment }: { comment: PortalComment }) {
  const keys = actorKeys(comment.actor);
  const detail = comment.actor.detail;
  if (keys.length === 0 && !detail) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md py-1 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        Keys and signals
        <span className="font-normal normal-case tracking-normal">
          {keys.length} keys{keys.some((key) => key.banned) ? ', some banned' : ''}
        </span>
        <ChevronDown className="ms-auto size-4 transition-transform group-data-panel-open:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul className="mt-2 flex flex-col divide-y divide-border/60">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-col gap-0.5 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{key.label}</span>
                <code className="truncate font-code text-muted-foreground text-xs" title={key.value}>{shortHandle(key.value)}</code>
                {key.banned && <Badge variant="error" size="sm">Banned</Badge>}
                {key.others && key.others.comments > 0 && (
                  <Link className="ms-auto shrink-0 text-xs underline-offset-2 hover:underline" to={pivotHref(key.source, key.value)}>
                    {key.others.comments} more{key.others.held > 0 ? ` · ${key.others.held} held` : ''}
                  </Link>
                )}
              </div>
              <p className="text-muted-foreground text-xs">{key.explain}</p>
            </li>
          ))}
        </ul>
        {detail && (
          <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 font-code text-muted-foreground text-xs">
            {Object.entries(detail)
              .filter(([, value]) => value !== null && value !== '')
              .map(([name, value]) => (
                <React.Fragment key={name}>
                  <dt>{name}</dt>
                  <dd className="min-w-0 break-all text-foreground/80">{String(value)}</dd>
                </React.Fragment>
              ))}
          </dl>
        )}
      </CollapsiblePanel>
    </Collapsible>
  );
}

const EVENT_LABELS: Record<string, string> = {
  'comment.create': 'Written',
  'comment.edit': 'Edited',
  'comment.remove': 'Removed by the writer',
  'comment.moderate': 'Checked',
  'comment.approve': 'Approved',
  'comment.hide': 'Unpublished',
  'comment.delete': 'Deleted',
};

const ACTOR_LABELS = { reader: 'the writer', model: 'the model', owner: 'you' } as const;

function HistorySection({ commentId }: { commentId: string }) {
  const history = useQuery({
    queryKey: ['activity', 'comment', commentId],
    queryFn: ({ signal }) => apiGet<PortalActivity>('admin/activity', { targetType: 'comment', targetId: commentId, limit: 20 }, signal),
    staleTime: 15_000,
  });
  return (
    <section>
      <SectionTitle>History</SectionTitle>
      {history.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : history.isError ? (
        <p className="text-muted-foreground text-sm">
          History did not load.{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => void history.refetch()}>
            Try again
          </button>
        </p>
      ) : history.data.entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
      ) : (
        <ol className="relative flex flex-col gap-3 border-s border-border ps-4">
          {history.data.entries.map((entry) => (
            <li key={entry.id} className="relative text-sm">
              <span className="absolute -start-[1.3125rem] top-1.5 size-2 rounded-full border-2 border-background bg-muted-foreground" aria-hidden />
              <span className="font-medium">{EVENT_LABELS[entry.event] ?? entry.event}</span>
              <span className="text-muted-foreground">
                {' '}by {ACTOR_LABELS[entry.actor]}
                {entry.source !== 'web' ? ` via ${entry.source}` : ''}
                {entry.reason && entry.reason !== 'ok' ? ` · ${entry.reason.replace(/_/g, ' ')}` : ''}
              </span>
              <time className="block text-muted-foreground text-xs" dateTime={entry.createdAt}>{absoluteTime(entry.createdAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
