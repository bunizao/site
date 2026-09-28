import * as React from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AdminCommentModeState, CommentSurface, CommentsMode } from '@bunizao/contracts';
import { Search } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/coss/input-group';
import { Kbd } from '@/components/coss/kbd';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { HEAD, ROW, SPACED, TABLE } from '../activity/table';
import { isMissingRoute } from '../app/api';
import { useHotkeys } from '../app/hotkeys';
import { setSearch, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { undoLast } from '../app/undo';
import { useStableView } from '../audience/stable-view';
import { stamp } from '../comments/model';
import { ghostPostsOptions } from '../tools/data';
import { fullTime, plural } from './format';
import {
  CACHE_NOTE,
  MODE_CHOICES as CHOICES,
  MODE_LABELS,
  MODE_TONE as TONE,
  describeModeError,
  modeId,
  prefetchModeOverrides,
  pruneCleared,
  useModeOverrides,
  useModeState,
  useSetMode,
  type ModeChoice as Choice,
} from './modes-data';
import { LoadError, Segmented, StatusDot, matchesWords, useSearchText } from './ui';

/* Per-post comment modes. With no search, every post whose mode the owner
   overrode, latest change first; a search finds any published post (or a
   pasted id) to override. Each row shows what the post's tags give, the
   override as one four-way switch, and what readers get. A change is one
   click, shows at once, and is undone from the toast or with Z. The comment
   pane's switch (comments/PostMode.tsx) shares this data. */

const SURFACE_LABELS: Record<CommentSurface, string> = { blog: 'Blog', mood: 'Mood' };
/* Each result reads its post's state, and site-api asks Ghost for each
   blog post, so a search shows a screenful, not the whole list. */
const RESULT_LIMIT = 12;
const SETTLE_MS = 250;

/* Stacked below 48rem of list width, a table above it. */
const GRID =
  'grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-1.5 @3xl:grid-cols-[minmax(0,1fr)_3.5rem_6rem_17.5rem_6rem_6.5rem] @3xl:gap-y-0 @5xl:gap-x-6';

interface Target {
  surface: CommentSurface;
  postId: string;
  title: string | null;
  slug: string | null;
}

/** A pasted id or mood link: digits are a mood post, 24 hex a Ghost post. */
function idTarget(query: string): Target | null {
  const text = query.trim();
  const mood = /(?:^|\/mood\/)(\d{1,12})\/?$/.exec(text);
  if (mood) return { surface: 'mood', postId: mood[1], title: null, slug: null };
  if (/^[0-9a-f]{24}$/i.test(text)) return { surface: 'blog', postId: text.toLowerCase(), title: null, slug: null };
  return null;
}

/** The overrides (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient): Promise<unknown> {
  return prefetchModeOverrides(client);
}

function rowFocus(id: string): void {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(`[data-mode-row="${CSS.escape(id)}"]`);
    row?.querySelector<HTMLElement>('[role=radio][aria-checked=true]')?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: 'nearest' });
  });
}

function focusedRow(): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? active.closest('[data-mode-row]')?.getAttribute('data-mode-row') ?? null : null;
}

export default function ModesScreen() {
  const location = useLocation();
  const client = useQueryClient();
  const [text, setText] = useSearchText(location.search.get('q') ?? '', (value) => setSearch({ q: value || null }));
  const query = React.useDeferredValue(text.trim());

  const overrides = useModeOverrides();
  const set = useSetMode();

  // A cleared row stays, showing Default, until the screen is left.
  React.useEffect(() => () => pruneCleared(client), [client]);

  const byId = React.useMemo(() => new Map((overrides.data?.modes ?? []).map((state) => [modeId(state), state])), [overrides.data]);
  const loadedIds = React.useMemo(
    () =>
      overrides.data?.modes
        .slice()
        .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || modeId(a).localeCompare(modeId(b)))
        .map(modeId),
    [overrides.data],
  );
  const stable = useStableView('modes', loadedIds);
  const { prepend } = stable;
  const listed = React.useMemo(() => stable.ids.flatMap((id) => byId.get(id) ?? []), [stable.ids, byId]);

  /* Search: published Ghost posts by title or slug, and a pasted id. The
     post list is read once a minute here, not polled. */
  const searching = query.length > 0;
  const posts = useQuery({ ...ghostPostsOptions, enabled: searching, refetchInterval: false, staleTime: 60_000 });
  const results = React.useMemo((): Target[] => {
    if (!searching) return [];
    const exact = idTarget(query);
    const found = (posts.data?.posts ?? [])
      .filter((post) => post.status === 'published' && matchesWords(`${post.title} ${post.slug} ${post.id}`, query))
      .map((post): Target => ({ surface: 'blog', postId: post.id, title: post.title, slug: post.slug }));
    if (exact && !found.some((target) => target.surface === exact.surface && target.postId === exact.postId)) found.unshift(exact);
    return found;
  }, [searching, query, posts.data]);

  const onSet = React.useCallback(
    (state: AdminCommentModeState, choice: Choice) => {
      const mode = choice === 'none' ? null : choice;
      // A post first overridden from a search goes on top of the list.
      if (mode && !state.override && !byId.has(modeId(state))) prepend([modeId(state)]);
      void set(state, mode);
    },
    [set, byId, prepend],
  );

  const ids = searching ? results.slice(0, RESULT_LIMIT).map(modeId) : listed.map(modeId);
  const move = (delta: number): void => {
    if (ids.length === 0) return;
    const at = ids.indexOf(focusedRow() ?? '');
    const next = ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? (delta > 0 ? 0 : ids.length - 1) : at + delta))];
    rowFocus(next);
  };

  const searchRef = React.useRef<HTMLInputElement>(null);
  useHotkeys({
    '/': () => searchRef.current?.focus(),
    j: () => move(1),
    arrowdown: () => move(1),
    k: () => move(-1),
    arrowup: () => move(-1),
    z: () => undoLast(),
    escape: () => {
      if (document.activeElement === searchRef.current) {
        if (text) setText('');
        else searchRef.current?.blur();
      }
    },
  });

  const header = (
    <div role="row" className={cn(GRID, HEAD, 'sticky top-0 z-10 hidden items-center bg-background px-3 @3xl:grid')}>
      <span role="columnheader">Post</span>
      <span role="columnheader">Where</span>
      <span role="columnheader" title="What the post's tags give; a mood post gets the site default">Tags give</span>
      <span role="columnheader">Override</span>
      <span role="columnheader">Readers get</span>
      <span role="columnheader">Changed</span>
    </div>
  );

  let body: React.ReactNode;
  if (searching) {
    const shown = results.slice(0, RESULT_LIMIT);
    body = posts.isPending && shown.length === 0 ? (
      <SkeletonRows count={4} />
    ) : shown.length === 0 ? (
      <p className="px-4 py-6 text-[13px] text-muted-foreground">
        {posts.isError
          ? `The post list did not load. ${posts.error instanceof Error ? posts.error.message : ''} A pasted post id still works.`
          : `No published post matches “${query}”. Paste a post id (24 hex characters) or a mood link to set one directly.`}
      </p>
    ) : (
      <div role="table" className={TABLE} aria-label="Matching posts">
        {header}
        {shown.map((target) => (
          <SearchRow key={modeId(target)} target={target} listed={byId.get(modeId(target)) ?? null} onSet={onSet} />
        ))}
        <p className="px-3 py-3 text-muted-foreground text-xs">
          {results.length > RESULT_LIMIT ? `First ${RESULT_LIMIT} of ${results.length}. Add a word to narrow it.` : plural(results.length, 'post')}
          {posts.data && ` · Searches the ${plural(posts.data.posts.length, 'most recent Ghost post')}.`}
        </p>
      </div>
    );
  } else if (overrides.isPending) {
    body = <SkeletonRows count={5} />;
  } else if (overrides.isError && isMissingRoute(overrides.error)) {
    body = (
      <p role="status" className="px-4 py-6 text-[13px] text-muted-foreground">
        Post modes need the updated site-api, which is not deployed yet. Nothing was changed.
      </p>
    );
  } else if (overrides.isError) {
    body = <LoadError what="Post modes" error={overrides.error} onRetry={() => void overrides.refetch()} className="[&>p:nth-child(2)]:max-w-prose" />;
  } else if (listed.length === 0) {
    body = (
      <p className="px-4 py-6 text-[13px] text-muted-foreground">
        No overrides: every post follows its tags (<span className="font-mono text-xs">#comments-readonly</span>,{' '}
        <span className="font-mono text-xs">#comments-off</span>), and mood posts the site default. Search above to override one.
      </p>
    );
  } else {
    body = (
      <div role="table" className={TABLE} aria-label="Overridden posts" aria-rowcount={listed.length}>
        {header}
        {stable.fresh.length > 0 && (
          <button
            type="button"
            className="mb-1 flex h-11 w-full items-center rounded-lg px-3 text-[13px] text-[hsl(var(--portal-accent))] outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent pointer-coarse:h-11"
            onClick={stable.merge}
          >
            Show {plural(stable.fresh.length, 'override')} set elsewhere
          </button>
        )}
        {listed.map((state) => (
          <ModeRow key={modeId(state)} state={state} title={state.title} slug={state.slug} onSet={onSet} />
        ))}
        <p className="px-3 py-3 text-muted-foreground text-xs">
          {plural(listed.filter((state) => state.override).length, 'override')}. Clearing one (Default) hands the post back to its tags.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <ScreenHeader title="Post modes" />

      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 sm:px-4">
        <InputGroup className="h-8 min-w-0 flex-1 pointer-coarse:h-11 sm:max-w-96">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            className="pointer-coarse:*:h-10.5!"
            type="search"
            aria-label="Find a post"
            placeholder="Find a post: title, slug or id"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'ArrowDown') {
                event.preventDefault();
                if (ids[0]) rowFocus(ids[0]);
              }
            }}
          />
          <InputGroupAddon align="inline-end" className="max-sm:hidden">
            <Kbd>/</Kbd>
          </InputGroupAddon>
        </InputGroup>
        <p className="text-muted-foreground text-xs max-sm:basis-full">{CACHE_NOTE}</p>
      </div>

      <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain" ref={stable.scrollRef}>
        {body}
      </div>
    </div>
  );
}

function ModeWord({ mode, unknown }: { mode: CommentsMode | null; unknown: string }) {
  if (!mode) return <span className="text-muted-foreground">{unknown}</span>;
  return <StatusDot tone={TONE[mode]}>{MODE_LABELS[mode]}</StatusDot>;
}

const ModeRow = React.memo(function ModeRow({ state, title, slug, onSet }: {
  state: AdminCommentModeState;
  title: string | null;
  slug: string | null;
  onSet: (state: AdminCommentModeState, choice: Choice) => void;
}) {
  const name = title ?? state.title;
  return (
    <div
      role="row"
      data-mode-row={modeId(state)}
      className={cn(GRID, ROW, SPACED, 'items-center px-3 py-3 focus-within:bg-accent/50 @3xl:py-1')}
    >
      <span role="cell" className="flex min-w-0 items-baseline gap-2">
        <span className={cn('truncate text-sm', !name && 'text-muted-foreground')} title={name ?? undefined}>{name ?? 'Unknown post'}</span>
        <span className="truncate font-mono text-[12px] text-muted-foreground tabular-nums" title={state.postId}>
          {slug ?? state.slug ?? state.postId}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 text-muted-foreground text-xs @3xl:contents">
        <span role="cell">{SURFACE_LABELS[state.surface]}</span>
        <span role="cell" className="text-foreground">
          <span className="@3xl:hidden text-muted-foreground">Tags give </span>
          <ModeWord mode={state.tagMode} unknown="Unknown" />
        </span>
      </span>
      <span role="cell">
        <Segmented
          label={`Override for ${name ?? state.postId}`}
          value={state.override ?? 'none'}
          options={[...CHOICES]}
          onChange={(choice) => onSet(state, choice)}
          className="@max-3xl:flex @max-3xl:w-full @max-3xl:[&>button]:flex-1 pointer-coarse:h-10"
        />
      </span>
      <span className="flex flex-wrap items-center gap-x-3 text-xs @3xl:contents">
        <span role="cell" className="font-medium">
          <span className="@3xl:hidden font-normal text-muted-foreground">Readers get </span>
          <ModeWord mode={state.effectiveMode} unknown="Unknown" />
        </span>
        <span role="cell" className="font-mono text-[12px] text-muted-foreground tabular-nums" title={state.updatedAt ? fullTime(state.updatedAt) : undefined}>
          {state.updatedAt ? stamp(state.updatedAt) : '—'}
        </span>
      </span>
    </div>
  );
});

/** A search result. Its state is read once the row has stayed on screen
    for a moment, so typing does not fire a lookup per keystroke; the list
    answers at once for a post that already has an override. */
function SearchRow({ target, listed, onSet }: {
  target: Target;
  listed: AdminCommentModeState | null;
  onSet: (state: AdminCommentModeState, choice: Choice) => void;
}) {
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  const one = useModeState(target.surface, target.postId, settled);
  const state = one.data ?? listed;
  if (state) return <ModeRow state={state} title={target.title} slug={target.slug} onSet={onSet} />;
  return (
    <div role="row" data-mode-row={modeId(target)} className={cn(GRID, ROW, SPACED, 'items-center px-3 py-3 @3xl:py-1')}>
      <span role="cell" className="flex min-w-0 items-baseline gap-2">
        <span className={cn('truncate text-sm', !target.title && 'text-muted-foreground')}>{target.title ?? `${SURFACE_LABELS[target.surface]} post`}</span>
        <span className="truncate font-mono text-[12px] text-muted-foreground tabular-nums">{target.slug ?? target.postId}</span>
      </span>
      {one.isError ? (
        <span role="cell" className="text-[13px] @3xl:col-span-5">
          <StatusDot tone="warning" className="whitespace-normal">{describeModeError(one.error)}</StatusDot>
        </span>
      ) : (
        <>
          <span className="hidden @3xl:contents">
            <Skeleton className="h-3 w-9" />
            <Skeleton className="h-3 w-16" />
          </span>
          <Skeleton className="h-8 w-full @3xl:w-[17.5rem]" />
          <span className="hidden @3xl:contents">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </span>
        </>
      )}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div aria-busy="true" aria-label="Loading post modes" className={TABLE}>
      <div className={cn('hidden @3xl:block', HEAD)} />
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn(GRID, ROW, SPACED, 'items-center px-3 py-3 @3xl:py-1')}>
          <Skeleton className="h-3.5 w-56 max-w-full" />
          <span className="hidden @3xl:contents">
            <Skeleton className="h-3 w-9" />
            <Skeleton className="h-3 w-16" />
          </span>
          <Skeleton className="h-8 w-full @3xl:w-[17.5rem]" />
          <span className="hidden @3xl:contents">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </span>
        </div>
      ))}
    </div>
  );
}
