import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, PenLine } from 'lucide-react';
import type { GhostAdminPostSummary } from '@/features/posts/server/ghost-admin';
import { Button } from '@/components/coss/button';
import { Kbd, KbdGroup } from '@/components/coss/kbd';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { BLEED, GUTTER, LIST, LoadError, Mono, PRESSABLE, ROW, Segmented, SkeletonRows, SMALL, Updating } from '../activity/table';
import { useHotkeys } from '../app/hotkeys';
import { setSearch, useLocation } from '../app/router';
import { useScrollRestoration } from '../app/scroll';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { ago, expiryText, fullTime } from '../moderation/format';
import { explained, prefetchGhostPosts, useGhostPosts } from './data';
import { DEVICE_OPTIONS, DeviceFrame, readDevice, revealRow, step, useSize, type Device } from './ui';

/* Blog previews: Ghost posts beside a live preview of the selected one.

   The selection is `?post=` and the width `?width=`, so a reload or a link
   lands on the same view. j and k move the highlight in the frame they are
   pressed; the preview follows once the keys settle, so a held key does not
   render every post on the way. The frame itself is the draft page, which
   reloads itself when the draft changes in Ghost (draft-live-reload). */

const GHOST_URL = ((import.meta.env.PUBLIC_GHOST_URL as string | undefined) ?? '').replace(/\/+$/, '');

type Group = 'draft' | 'scheduled' | 'published' | 'other';

const GROUPS: Array<{ key: Group; label: string }> = [
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'other', label: 'Other' },
];

function groupOf(status: string): Group {
  return status === 'draft' || status === 'scheduled' || status === 'published' ? status : 'other';
}

/** The time a row shows, in the words its group needs. */
function when(post: GhostAdminPostSummary): { text: string; title: string } {
  if (post.status === 'scheduled' && post.publishedAt) {
    return { text: expiryText(post.publishedAt), title: `Publishes ${fullTime(post.publishedAt)}` };
  }
  const at = post.updatedAt ?? post.publishedAt;
  return at ? { text: ago(at), title: `Edited ${fullTime(at)}` } : { text: 'never', title: 'Never edited' };
}

function previewPath(post: GhostAdminPostSummary, demo: boolean): string {
  // The demo has no Ghost key for /dev/blog/<id>; the mock blog serves the slug.
  return demo ? `/blog/${post.slug}` : `/dev/blog/${post.id}`;
}

/** The src the frame should show: at once after a pause, and only once the
    keys settle while they are held down. */
function useSettledSrc(target: string | null): string | null {
  const [src, setSrc] = React.useState(target);
  const lastChange = React.useRef(0);
  React.useEffect(() => {
    const now = performance.now();
    const quiet = now - lastChange.current > 250;
    lastChange.current = now;
    if (quiet) {
      setSrc(target);
      return;
    }
    const timer = setTimeout(() => setSrc(target), 150);
    return () => clearTimeout(timer);
  }, [target]);
  return src;
}

/** Ids whose row changed in the last poll, lit for a moment. */
function useChangedRows(posts: GhostAdminPostSummary[] | undefined): ReadonlySet<string> {
  const seen = React.useRef<Map<string, string | null> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [changed, setChanged] = React.useState<ReadonlySet<string>>(new Set());
  React.useEffect(() => {
    if (!posts) return;
    const previous = seen.current;
    seen.current = new Map(posts.map((post) => [post.id, post.updatedAt]));
    if (!previous) return;
    const ids = posts.filter((post) => previous.get(post.id) !== post.updatedAt).map((post) => post.id);
    if (ids.length === 0) return;
    setChanged(new Set(ids));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setChanged(new Set()), 1200);
  }, [posts]);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return changed;
}

// The last post looked at, so coming back from another screen lands on it.
let lastPost: string | null = null;
// Whether the open stacked preview was pushed from the list by this screen.
let pushedPost = false;

const PostRow = React.memo(function PostRow({
  post,
  selected,
  changed,
  onSelect,
}: {
  post: GhostAdminPostSummary;
  selected: boolean;
  changed: boolean;
  onSelect: (id: string) => void;
}) {
  const time = when(post);
  return (
    <button
      type="button"
      data-row-id={post.id}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(post.id)}
      className={cn(
        'flex w-full items-center gap-3 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        ROW,
        BLEED,
        PRESSABLE,
        selected && 'bg-accent text-foreground',
        changed && !selected && 'bg-[hsl(var(--portal-accent)/0.14)]',
      )}
    >
      <span className={cn('min-w-0 flex-1 truncate', !post.title && 'text-muted-foreground italic')} title={post.title || undefined}>
        {post.title || 'Untitled'}
      </span>
      <Mono className="shrink-0 text-muted-foreground text-xs">
        <span title={time.title}>{changed ? 'just now' : time.text}</span>
      </Mono>
    </button>
  );
});

/** The post list (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient): Promise<unknown> {
  return prefetchGhostPosts(client);
}

export default function BlogScreen() {
  const { search } = useLocation();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const split = useSize(rootRef).width >= 720;

  const list = useGhostPosts();
  const posts = list.data?.posts;
  const demo = list.data?.demo ?? false;

  const groups = React.useMemo(
    () =>
      GROUPS.map((group) => ({ ...group, posts: (posts ?? []).filter((post) => groupOf(post.status) === group.key) })).filter(
        (group) => group.posts.length > 0,
      ),
    [posts],
  );
  const ids = React.useMemo(() => groups.flatMap((group) => group.posts.map((post) => post.id)), [groups]);

  // Side by side, something is always open: the URL's post, the last one
  // looked at, or the newest draft. Stacked, no post means the list.
  const urlPost = search.get('post');
  const fallback = lastPost && ids.includes(lastPost) ? lastPost : (ids[0] ?? null);
  const selectedId = urlPost ?? (split ? fallback : null);
  const selected = posts?.find((post) => post.id === selectedId) ?? null;
  if (selected) lastPost = selected.id;
  const device = readDevice(search);

  // Stable, so a selection change re-renders two rows, not the list.
  const opening = React.useRef(false);
  opening.current = !split && !urlPost;
  const select = React.useCallback((id: string | null) => {
    if (!id) return;
    // Stacked, opening a post is a step Back should undo.
    if (opening.current) pushedPost = true;
    setSearch({ post: id }, { push: opening.current });
  }, []);

  React.useEffect(() => {
    if (!urlPost) pushedPost = false;
  }, [urlPost]);

  // Back to the list: undo the push if this screen made one, otherwise (a
  // deep link) clear the post in place rather than leave the portal.
  const backToList = React.useCallback(() => {
    if (pushedPost) {
      pushedPost = false;
      history.back();
    } else {
      setSearch({ post: null });
    }
  }, []);

  useHotkeys({
    j: () => select(step(ids, selectedId, 1)),
    k: () => select(step(ids, selectedId, -1)),
    escape: () => {
      if (!split && urlPost) backToList();
    },
  });

  React.useLayoutEffect(() => revealRow(listRef.current, selectedId), [selectedId]);
  useScrollRestoration(listRef, 'blog', Boolean(posts));
  const changed = useChangedRows(posts);

  const target = selected ? previewPath(selected, demo) : null;
  const src = useSettledSrc(target);
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loading = src !== null && src !== loadedSrc;

  const showList = split || !urlPost;
  const showFrame = split || Boolean(urlPost);

  const controls = selected && showFrame && (
    <span className="ms-auto flex min-w-0 items-center gap-2">
      <span className="max-sm:hidden">
        <Updating active={loading} label="Loading" />
      </span>
      <Segmented<Device>
        label="Preview width"
        value={device}
        options={DEVICE_OPTIONS}
        onChange={(next) => setSearch({ width: next === 'phone' ? 'phone' : null })}
      />
      <Button
        size="sm"
        variant="outline"
        className={cn(SMALL, 'active:bg-accent max-sm:w-8 max-sm:px-0')}
        render={<a href={target ?? undefined} target="_blank" rel="noreferrer" aria-label="Open the preview in a new tab" />}
      >
        <ExternalLink aria-hidden />
        <span className="max-sm:hidden">New tab</span>
      </Button>
      {GHOST_URL && !demo && (
        <Button
          size="sm"
          variant="outline"
          className={cn(SMALL, 'active:bg-accent max-sm:hidden')}
          render={<a href={`${GHOST_URL}/ghost/#/editor/post/${selected.id}`} target="_blank" rel="noreferrer" />}
        >
          <PenLine aria-hidden />
          Edit in Ghost
        </Button>
      )}
    </span>
  );

  let listBody: React.ReactNode;
  if (list.isPending) {
    // The group heading's row too, so the list lands without a shift.
    listBody = (
      <div aria-hidden>
        <div className={cn('flex min-h-11 items-end pb-2', GUTTER)}>
          <Skeleton className="h-3 w-14" />
        </div>
        <SkeletonRows rows={10} widths={['w-2/3', 'w-10']} />
      </div>
    );
  } else if (list.isError && !posts) {
    listBody = <LoadError what="the post list" error={explained(list.error)} onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  } else if (ids.length === 0) {
    listBody = (
      <div className={cn('flex flex-col items-start gap-2 py-8 text-sm', GUTTER)}>
        <p className="font-medium">No posts in Ghost yet.</p>
        <p className="text-muted-foreground">Start a draft in Ghost; it shows up here within five seconds.</p>
      </div>
    );
  } else {
    listBody = groups.map((group) => (
      <section key={group.key} aria-labelledby={`blog-group-${group.key}`}>
        <div className={cn('flex min-h-11 items-end gap-2 pb-2', GUTTER)}>
          <h2 id={`blog-group-${group.key}`} className="font-medium text-muted-foreground text-sm">{group.label}</h2>
          <span className="text-[13px] text-muted-foreground tabular-nums">{group.posts.length}</span>
        </div>
        <div className={LIST}>
          {group.posts.map((post) => (
            <PostRow key={post.id} post={post} selected={post.id === selectedId} changed={changed.has(post.id)} onSelect={select} />
          ))}
        </div>
      </section>
    ));
  }

  return (
    <div ref={rootRef} className="flex h-svh flex-col">
      <ScreenHeader title="Blog previews">{controls}</ScreenHeader>

      <div className="flex min-h-0 flex-1">
        {/* Hidden rather than unmounted while a stacked preview is open, so
            Back finds the list scrolled where it was. */}
        <div
          ref={listRef}
          hidden={!showList}
          className={cn('min-h-0 overflow-y-auto overscroll-contain', split ? 'w-72 shrink-0 border-e xl:w-80' : 'flex-1')}
        >
            {listBody}
            {split && ids.length > 1 && (
              <p className={cn('flex items-center gap-1.5 py-3 text-muted-foreground text-xs pointer-coarse:hidden', GUTTER)}>
                <KbdGroup>
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
                move between posts
              </p>
            )}
        </div>

        {showFrame && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[hsl(240_6%_4%)]">
            {!split && (
              <div className={cn('flex h-11 shrink-0 items-center gap-2 border-b bg-background', GUTTER)}>
                <Button size="icon-sm" variant="ghost" aria-label="Back to posts" onClick={backToList} className="-ms-2 active:bg-accent pointer-coarse:size-11">
                  <ArrowLeft aria-hidden />
                </Button>
                <span className="min-w-0 truncate font-medium text-sm">{selected ? selected.title || 'Untitled' : posts ? 'Post not found' : ''}</span>
                <Updating active={loading} label="Loading" />
              </div>
            )}
            {src ? (
              <DeviceFrame
                device={device}
                desktopMin={1024}
                src={src}
                title={selected ? `Preview of ${selected.title || 'an untitled post'}` : 'Post preview'}
                onLoad={() => setLoadedSrc(src)}
              />
            ) : ids.length === 0 ? null : (
              <div className={cn('flex flex-1 items-center justify-center text-muted-foreground text-sm', GUTTER)}>
                {urlPost && posts
                  ? `That post is no longer in Ghost. ${split ? 'Pick another from the list.' : 'Go back and pick another.'}`
                  : 'Pick a post to preview it.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
