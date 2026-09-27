import * as React from 'react';
import type { AdminSourceKeyType } from '@bunizao/contracts';
import { Ban, Check, Inbox, ListFilter, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/coss/alert';
import { Button } from '@/components/coss/button';
import { Checkbox } from '@/components/coss/checkbox';
import { Drawer, DrawerPopup } from '@/components/coss/drawer';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/coss/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import { Skeleton } from '@/components/coss/skeleton';
import { Tabs, TabsList, TabsTab } from '@/components/coss/tabs';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { cn } from '@/lib/utils';
import type { PortalComment } from '@/features/admin/server/portal-client';
import { describeError } from '../app/api';
import { useHotkeys } from '../app/hotkeys';
import { Link, navigate, setSearch, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { BanDialog, type BanTarget } from './BanDialog';
import { CommentPane } from './CommentPane';
import { CommentRow } from './CommentRow';
import {
  STATUS_FILTERS,
  STATUS_LABELS,
  useCommentCounts,
  useCommentList,
  useModerate,
  usePendingDeletes,
  type StatusFilter,
  type Verdict,
} from './data';
import { KEY_KINDS, shortHandle } from './model';

const SOURCE_KEYS = new Set<string>([
  ...Object.values(KEY_KINDS).map((kind) => kind.source),
  'asn',
  'domain',
]);

function readFilter(search: URLSearchParams) {
  const status = search.get('status');
  const key = search.get('key');
  const value = search.get('value');
  const pivot = key && value && SOURCE_KEYS.has(key) ? { key: key as AdminSourceKeyType, value } : null;
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? '') ? (status as StatusFilter) : pivot ? 'all' : 'held',
    pivot,
    postId: search.get('post'),
  };
}

function matches(comment: PortalComment, query: string): boolean {
  const haystack = `${comment.author} ${comment.body} ${comment.postTitle ?? ''} ${comment.actor.email ?? ''}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export default function CommentsScreen() {
  const location = useLocation();
  const { status, pivot, postId } = readFilter(location.search);
  const query = location.search.get('q') ?? '';
  const selectedId = location.search.get('c') ?? (location.hash || null);

  const list = useCommentList({ status, postId, key: pivot?.key ?? null, value: pivot?.value ?? null });
  const counts = useCommentCounts();
  const pending = usePendingDeletes();
  const moderate = useModerate();
  const narrow = useMediaQuery('max-lg');

  const loaded = React.useMemo(() => list.data?.pages.flatMap((page) => page.comments) ?? [], [list.data]);
  const rows = React.useMemo(
    () =>
      loaded.filter(
        (comment) =>
          !pending.has(comment.id) &&
          (status === 'all' || comment.status === status) &&
          (!query || matches(comment, query)),
      ),
    [loaded, pending, status, query],
  );
  const total = list.data?.pages[0]?.total ?? 0;

  const index = selectedId ? rows.findIndex((row) => row.id === selectedId) : -1;
  const selected = index >= 0 ? rows[index] : null;

  // Where to land after the selected row leaves the list: its old neighbour.
  const lastIndex = React.useRef(0);
  React.useEffect(() => {
    if (index >= 0) lastIndex.current = index;
  }, [index]);

  const select = React.useCallback((id: string | null, scroll = true) => {
    setSearch({ c: id });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (id && scroll) requestAnimationFrame(() => document.getElementById(`row-${id}`)?.scrollIntoView({ block: 'nearest' }));
  }, []);

  // Keep a desktop selection alive: when the active row is acted on, move to
  // the row that took its place, like Mail's auto-advance.
  React.useEffect(() => {
    if (narrow || list.isPending) return;
    if (selectedId && index === -1 && rows.length > 0 && !location.hash) {
      const next = rows[Math.min(lastIndex.current, rows.length - 1)];
      select(next.id);
    }
  }, [narrow, list.isPending, selectedId, index, rows, select, location.hash]);

  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const anchor = React.useRef<string | null>(null);
  const checkedRows = React.useMemo(() => rows.filter((row) => checked.has(row.id)), [rows, checked]);
  React.useEffect(() => setChecked(new Set()), [status, pivot?.key, pivot?.value, postId]);

  const onCheck = React.useCallback(
    (comment: PortalComment, value: boolean, range: boolean) => {
      setChecked((current) => {
        const next = new Set(current);
        if (range && anchor.current) {
          const from = rows.findIndex((row) => row.id === anchor.current);
          const to = rows.findIndex((row) => row.id === comment.id);
          if (from >= 0 && to >= 0) {
            for (const row of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) {
              if (value) next.add(row.id);
              else next.delete(row.id);
            }
            return next;
          }
        }
        if (value) next.add(comment.id);
        else next.delete(comment.id);
        return next;
      });
      anchor.current = comment.id;
    },
    [rows],
  );

  const [ban, setBan] = React.useState<BanTarget | null>(null);
  const [banOpen, setBanOpen] = React.useState(false);
  const openBan = React.useCallback((comment: PortalComment) => {
    setBan({ kind: 'actor', actor: comment.actor });
    setBanOpen(true);
  }, []);

  const act = React.useCallback(
    (comment: PortalComment, verdict: Verdict) => {
      moderate([comment], verdict);
    },
    [moderate],
  );

  const actOnChecked = (verdict: Verdict): void => {
    const eligible = checkedRows.filter((row) =>
      verdict === 'approve' ? row.status === 'held' || row.status === 'rejected' : verdict === 'hide' ? row.status === 'published' : row.status !== 'deleted',
    );
    moderate(eligible, verdict);
    setChecked(new Set());
  };

  const move = (delta: number): void => {
    if (rows.length === 0) return;
    const from = index === -1 ? (delta > 0 ? -1 : rows.length) : index;
    const next = rows[Math.max(0, Math.min(rows.length - 1, from + delta))];
    select(next.id);
    if (from + delta >= rows.length - 5 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  };

  const searchRef = React.useRef<HTMLInputElement>(null);
  useHotkeys({
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    a: () => selected && (selected.status === 'held' || selected.status === 'rejected') && act(selected, 'approve'),
    u: () => selected?.status === 'published' && act(selected, 'hide'),
    d: () => selected && selected.status !== 'deleted' && act(selected, 'delete'),
    b: () => selected && openBan(selected),
    x: () => selected && onCheck(selected, !checked.has(selected.id), false),
    'shift+a': () => checkedRows.length > 0 && actOnChecked('approve'),
    'shift+d': () => checkedRows.length > 0 && actOnChecked('delete'),
    z: () => undoLast(),
    '/': () => searchRef.current?.focus(),
    escape: () => {
      if (document.activeElement === searchRef.current) searchRef.current?.blur();
      else if (checked.size > 0) setChecked(new Set());
      else if (narrow) select(null);
    },
    ...Object.fromEntries(STATUS_FILTERS.map((filter, i) => [String(i + 1), () => setSearch({ status: filter, c: null })])),
  });

  // Infinite scroll, with a button fallback: a hidden tab never intersects.
  const sentinel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = sentinel.current;
    if (!node || !list.hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !list.isFetchingNextPage) void list.fetchNextPage();
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.isFetchingNextPage, list.fetchNextPage]);

  const deepLinkMissing = Boolean(location.hash) && !list.isPending && index === -1;

  const pane = selected ? (
    <CommentPane
      comment={selected}
      position={{ index, total: rows.length }}
      onPrev={index > 0 ? () => move(-1) : null}
      onNext={index < rows.length - 1 ? () => move(1) : null}
      onAct={act}
      onBan={openBan}
      compact={narrow}
    />
  ) : null;

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Comments">
        <InputGroup className="ms-auto w-full max-w-64">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            aria-label="Filter loaded comments"
            placeholder="Filter loaded"
            value={query}
            onChange={(event) => setSearch({ q: event.target.value || null })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'ArrowDown') {
                event.preventDefault();
                event.currentTarget.blur();
                if (rows[0]) select(rows[0].id);
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
      </ScreenHeader>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(22rem,28rem)_1fr]">
        <section aria-label="Comment list" className="flex min-h-0 flex-col border-e">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Tabs value={status} onValueChange={(value) => setSearch({ status: value as string, c: null })} className="min-w-0 flex-1 overflow-x-auto">
              <TabsList variant="underline" className="gap-0.5">
                {STATUS_FILTERS.map((filter) => {
                  const count = filter === 'all' ? null : counts.data?.[filter];
                  return (
                    <TabsTab key={filter} value={filter} className="h-8 gap-1.5 px-2.5 text-sm">
                      {STATUS_LABELS[filter]}
                      {count !== null && count !== undefined && (filter === 'held' || filter === 'rejected') && count > 0 && (
                        <span className={cn('rounded-sm px-1 text-xs tabular-nums', filter === 'held' ? 'bg-warning/16 text-warning-foreground' : 'bg-muted text-muted-foreground')}>
                          {count}
                        </span>
                      )}
                    </TabsTab>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>

          {(pivot || postId) && (
            <div className="flex items-center gap-2 border-b bg-info/8 px-4 py-2 text-sm">
              <ListFilter className="size-4 shrink-0 text-info" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {pivot ? (
                  <>
                    Sharing {Object.values(KEY_KINDS).find((kind) => kind.source === pivot.key)?.label.toLowerCase() ?? pivot.key}{' '}
                    <code className="font-code text-xs">{shortHandle(pivot.value)}</code>
                  </>
                ) : (
                  <>On one post</>
                )}
              </span>
              <Button size="xs" variant="ghost" onClick={() => setSearch({ key: null, value: null, post: null, c: null })}>
                <X />
                Clear
              </Button>
            </div>
          )}

          {checkedRows.length > 0 && (
            <div className="flex items-center gap-2 border-b bg-accent/60 px-3 py-2 text-sm" role="toolbar" aria-label="Bulk actions">
              <Checkbox
                checked={checkedRows.length === rows.length}
                indeterminate={checkedRows.length < rows.length}
                aria-label="Select all loaded"
                onCheckedChange={(value) => setChecked(value ? new Set(rows.map((row) => row.id)) : new Set())}
              />
              <span className="me-auto tabular-nums">{checkedRows.length} selected</span>
              {checkedRows.some((row) => row.status === 'held' || row.status === 'rejected') && (
                <Button size="xs" onClick={() => actOnChecked('approve')}>
                  <Check />
                  Approve
                </Button>
              )}
              <Button size="xs" variant="destructive-outline" onClick={() => actOnChecked('delete')}>
                <Trash2 />
                Delete
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label="Clear selection" onClick={() => setChecked(new Set())}>
                <X />
              </Button>
            </div>
          )}

          {deepLinkMissing && (
            <Alert variant="info" className="m-3 w-auto">
              <AlertTitle>That comment is not in {STATUS_LABELS[status]}</AlertTitle>
              <AlertDescription>Someone may have handled it already, perhaps from Telegram.</AlertDescription>
              <AlertAction>
                <Button size="xs" variant="outline" render={<Link to={`/comments?status=all&c=${location.hash}`} />}>
                  Look in All
                </Button>
              </AlertAction>
            </Alert>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-slot="comment-scroll">
            {list.isPending ? (
              <ul aria-busy="true" aria-label="Loading comments">
                {Array.from({ length: 8 }, (_, i) => (
                  <li key={i} className="flex gap-3 border-b border-border/60 px-4 py-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : list.isError ? (
              <Alert variant="error" className="m-3 w-auto">
                <AlertTitle>Comments did not load</AlertTitle>
                <AlertDescription>{describeError(list.error)}</AlertDescription>
                <AlertAction>
                  <Button size="xs" variant="outline" onClick={() => void list.refetch()}>
                    <RefreshCw />
                    Try again
                  </Button>
                </AlertAction>
              </Alert>
            ) : rows.length === 0 ? (
              <EmptyList status={status} query={query} filtered={Boolean(pivot || postId)} />
            ) : (
              <>
                <ul aria-label={`${STATUS_LABELS[status]} comments`}>
                  {rows.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      filter={status}
                      active={comment.id === selected?.id}
                      checked={checked.has(comment.id)}
                      selecting={checked.size > 0}
                      onOpen={(row) => select(row.id, false)}
                      onCheck={onCheck}
                    />
                  ))}
                </ul>
                <div ref={sentinel} className="flex flex-col items-center gap-2 px-4 py-4 text-muted-foreground text-xs">
                  {list.hasNextPage ? (
                    <Button size="xs" variant="ghost" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                      Load more
                    </Button>
                  ) : (
                    <span>
                      {query ? `${rows.length} of ${loaded.length} loaded match` : `All ${total} shown`}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {!narrow && (
          <section aria-label="Selected comment" className="flex min-h-0 flex-col">
            {pane ?? <PaneHint count={rows.length} />}
          </section>
        )}
      </div>

      {narrow && (
        <Drawer open={Boolean(selected)} onOpenChange={(open) => !open && select(null)}>
          <DrawerPopup showBar className="h-[92svh]">
            {pane}
          </DrawerPopup>
        </Drawer>
      )}

      <BanDialog target={ban} open={banOpen} onOpenChange={setBanOpen} />
    </div>
  );
}

function EmptyList({ status, query, filtered }: { status: StatusFilter; query: string; filtered: boolean }) {
  if (query) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle>No loaded comment matches “{query}”</EmptyTitle>
          <EmptyDescription>The filter only searches what is loaded. Scroll to load more, or clear it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={() => setSearch({ q: null })}>Clear filter</Button>
        </EmptyContent>
      </Empty>
    );
  }
  if (status === 'held' && !filtered) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Inbox />
          </EmptyMedia>
          <EmptyTitle>Nothing is waiting for you</EmptyTitle>
          <EmptyDescription>Comments the checks hold back land here. Published ones go straight to the site.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={() => setSearch({ status: 'published' })}>See published</Button>
        </EmptyContent>
      </Empty>
    );
  }
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyTitle>No {STATUS_LABELS[status].toLowerCase()} comments{filtered ? ' here' : ''}</EmptyTitle>
        <EmptyDescription>{filtered ? 'Nothing else matches this filter.' : 'Try another tab.'}</EmptyDescription>
      </EmptyHeader>
      {filtered && (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={() => setSearch({ key: null, value: null, post: null })}>Clear filter</Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

function PaneHint({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground text-sm">
      <p>{count > 0 ? 'Pick a comment to read it in full.' : 'Nothing selected.'}</p>
      <p className="flex items-center gap-1.5 text-xs">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd>
        to move,
        <Kbd>?</Kbd>
        for every shortcut
      </p>
      <Button size="xs" variant="ghost" onClick={() => navigate('/comments/bans')}>
        <Ban />
        Manage bans
      </Button>
    </div>
  );
}
