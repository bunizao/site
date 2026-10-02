import * as React from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import type { AdminOwnerMessageListResult } from '@bunizao/contracts';
import { useSidebar } from '@/components/coss/sidebar';
import { cn } from '@/lib/utils';
import { useCommentCounts } from '../../comments/data';
import { NAV } from '../nav';
import { Link, usePathSelect } from '../router';

/* The phone's tab bar: the four screens a phone visit is for, one tap each,
   and More for the rest (the sidebar sheet). Below `md` only; tablet and
   desk keep the sidebar. Its height is `--portal-tabbar-h`, set on the
   portal root (PortalApp.tsx), which also sizes the screens to end above it. */

const TAB_IDS = ['home', 'comments', 'messages', 'subscribers'];
const TABS = NAV.flatMap((group) => group.items).filter((item) => TAB_IDS.includes(item.id));

/** messageKeys.list('inbox') in messages/data.ts, spelled out so the shell
    chunk does not pull in the inbox's code (a unit test keeps them equal). */
export const INBOX_KEY = ['messages', 'list', 'inbox'] as const;

/** The tab a path belongs to: a tab's own screen and anything under it
    (`/comments/bans`, `/subscribers/<hash>`), else More. */
export function tabFor(path: string): string {
  if (path === '/') return 'home';
  const tab = TABS.find((item) => item.to !== '/' && (path === item.to || path.startsWith(`${item.to}/`)));
  return tab?.id ?? 'more';
}

const ITEM =
  'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 font-medium text-[11px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:text-foreground';
/** On the icon's top-right corner; after the label in the DOM, so the link
    reads "Comments, 3 held". */
const BADGE = 'absolute top-1 start-[calc(50%+0.25rem)] min-w-4 rounded-full px-1 text-center font-medium text-[10px] text-background tabular-nums leading-4';

function count(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** The sidebar's held count: same query, so no read of its own. */
function HeldBadge() {
  const held = useCommentCounts().data?.held ?? 0;
  if (held === 0) return null;
  return <span className={cn(BADGE, 'bg-warning')} aria-label={`${held} held`}>{count(held)}</span>;
}

/* Unread messages as the inbox list last loaded them: the shell's idle
   warm-up, or the Messages screen, which polls it while open. Read from the
   cache, not observed: an observer would put its own options on that
   infinite query, and the tab bar must not add a read or a poll. Nothing
   shows while the cache holds no inbox (never loaded, or collected five
   minutes after the Messages screen closed). */
function UnreadBadge() {
  const client = useQueryClient();
  const subscribe = React.useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]);
  const read = () => client.getQueryData<InfiniteData<AdminOwnerMessageListResult>>(INBOX_KEY)?.pages[0]?.counts.new ?? 0;
  const unread = React.useSyncExternalStore(subscribe, read, () => 0);
  if (unread === 0) return null;
  return <span className={cn(BADGE, 'bg-muted-foreground')} aria-label={`${unread} unread`}>{count(unread)}</span>;
}

export function BottomTabs() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  // The tab only: a screen writing its query string must not re-render the bar.
  const active = usePathSelect(tabFor);
  if (!isMobile) return null;

  return (
    <nav
      aria-label="Tab bar"
      className="fixed inset-x-0 bottom-0 z-40 flex h-(--portal-tabbar-h) border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map((tab) => (
        <Link key={tab.id} to={tab.to} className={ITEM} aria-current={active === tab.id ? 'page' : undefined}>
          <tab.Icon className="size-5" aria-hidden />
          {tab.label}
          {tab.id === 'comments' && <HeldBadge />}
          {tab.id === 'messages' && <UnreadBadge />}
        </Link>
      ))}
      <button
        type="button"
        className={ITEM}
        aria-current={active === 'more' ? 'page' : undefined}
        aria-haspopup="dialog"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MoreHorizontal className="size-5" aria-hidden />
        More
      </button>
    </nav>
  );
}
