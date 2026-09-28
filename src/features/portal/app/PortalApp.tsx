import * as React from 'react';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarInset, SidebarProvider } from '@/components/coss/sidebar';
import { useMediaQuery } from '@/components/coss/hooks/use-media-query';
import { ToastProvider, toastManager } from '@/components/coss/toast';
import { TooltipProvider } from '@/components/coss/tooltip';
import { useCommentCounts } from '../comments/data';
import { ApiError } from './api';
import { useHotkeys } from './hotkeys';
import { lazyPart, lazyScreen, type ScreenRoute } from './lazy-screen';
import { flatNav } from './nav';
import { Outlet } from './Outlet';
import { navigate, registerAppRoutes } from './router';
import { AppSidebar, type PortalUser } from './shell/AppSidebar';
import { BottomTabs } from './shell/BottomTabs';
import { ScreenHeader } from './shell/ScreenHeader';

/* Screens this app renders. A path not listed here is still a server page,
   and links to it fall back to a normal navigation (see router.tsx). */
const ROUTES: ScreenRoute[] = [
  { pattern: /^\/comments$/, Screen: lazyScreen(() => import('../comments/CommentsScreen')) },
  { pattern: /^\/comments\/source\/[^/]+\/[^/]+$/, Screen: lazyScreen(() => import('../comments/SourceRedirect')) },
  { pattern: /^\/comments\/reactions$/, Screen: lazyScreen(() => import('../moderation/ReactionsScreen')) },
  { pattern: /^\/comments\/bans$/, Screen: lazyScreen(() => import('../moderation/BansScreen')) },
  { pattern: /^\/comments\/insights$/, Screen: lazyScreen(() => import('../moderation/InsightsScreen')) },
  { pattern: /^\/comments\/modes$/, Screen: lazyScreen(() => import('../moderation/ModesScreen')) },
  // The open message is ?m=; an old /messages/<id> link is rewritten to it.
  { pattern: /^\/messages(\/[^/]+)?$/, Screen: lazyScreen(() => import('../messages/MessagesScreen')) },
  { pattern: /^\/$/, Screen: lazyScreen(() => import('../home/HomeScreen')) },
  { pattern: /^\/activity$/, Screen: lazyScreen(() => import('../activity/ActivityScreen')) },
  // One entry for the list and an open article, so the list stays mounted.
  { pattern: /^\/analytics(\/[^/]+)?$/, Screen: lazyScreen(() => import('../analytics/AnalyticsScreen')) },
  // The open subscriber is part of the path, so the list stays mounted.
  { pattern: /^\/subscribers(\/[^/]+)?$/, Screen: lazyScreen(() => import('../audience/SubscribersScreen')) },
  // `/broadcasts/<id>` is a detail and `/broadcasts/new` the composer, both over the list.
  { pattern: /^\/broadcasts(\/[^/]+)?$/, Screen: lazyScreen(() => import('../audience/BroadcastsScreen')) },
  { pattern: /^\/blog$/, Screen: lazyScreen(() => import('../tools/BlogScreen')) },
  { pattern: /^\/newsletter$/, Screen: lazyScreen(() => import('../tools/NewsletterScreen')) },
  { pattern: /^\/mood$/, Screen: lazyScreen(() => import('../tools/MoodScreen')) },
  { pattern: /^\/settings$/, Screen: lazyScreen(() => import('../tools/SettingsScreen')) },
  // Not preloaded on idle: the mascot catalog, the SVG gallery and the
  // embed preview load on link intent or when their screen opens.
  { pattern: /^\/svg$/, Screen: lazyScreen(() => import('../tools/SvgScreen'), { idle: false }) },
  { pattern: /^\/mascot$/, Screen: lazyScreen(() => import('../tools/MascotScreen'), { idle: false }) },
  { pattern: /^\/mood-embed$/, Screen: lazyScreen(() => import('../tools/MoodEmbedScreen'), { idle: false }) },
];

registerAppRoutes(ROUTES.map((route) => route.pattern));

/* Opened by a key, so kept out of the first chunk: 23 KiB gzip, most of it
   the palette's combobox. They load with the screen chunks once the first
   screen is up (see lazy-screen.ts). */
const CommandPalette = lazyPart(() => import('./shell/CommandPalette').then((module) => module.CommandPalette));
const ShortcutsDialog = lazyPart(() => import('./shell/ShortcutsDialog').then((module) => module.ShortcutsDialog));

/** Opens a lazy dialog once its chunk is in, which the idle preload has
    usually seen to, so it never mounts suspended: React holds a suspended
    reveal back for up to 300ms. */
function openWhenLoaded(part: { preload: () => Promise<unknown> }, setOpen: (open: boolean) => void): void {
  part.preload().then(
    () => {
      // Mounted closed first: a dialog mounted open skips its enter transition.
      flushSync(() => setOpen(false));
      setOpen(true);
    },
    () => toastManager.add({ type: 'error', title: 'That did not load', description: 'Check the connection, then press the key again.' }),
  );
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        refetchOnWindowFocus: true,
        // A 4xx will not fix itself on retry; a flaky 5xx or network blip might.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      },
    },
  });
}

function NotFound({ path }: { path: string }) {
  // The header keeps the sidebar toggle, the phone's only way to the nav.
  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Not found" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
        <p>
          Nothing lives at <code className="font-code">{path}</code>.
        </p>
        <button type="button" className="underline underline-offset-2" onClick={() => navigate('/comments')}>
          Go to the comment inbox
        </button>
      </div>
    </div>
  );
}

const notFound = (path: string) => <NotFound path={path} />;

function Shell({ user, demo }: { user: PortalUser | null; demo: boolean }) {
  // null until first opened, and only set once the chunk is in: before,
  // the dialog is neither mounted nor loaded.
  const [palette, setPalette] = React.useState<boolean | null>(null);
  const [shortcuts, setShortcuts] = React.useState<boolean | null>(null);
  const openPalette = React.useCallback(() => openWhenLoaded(CommandPalette, setPalette), []);
  const openShortcuts = React.useCallback(() => openWhenLoaded(ShortcutsDialog, setShortcuts), []);

  useHotkeys({
    'mod+k': () => (palette ? setPalette(false) : openPalette()),
    '?': openShortcuts,
    ...Object.fromEntries(
      flatNav()
        .filter((item) => item.chord)
        .map((item) => [`g ${item.chord}`, () => navigate(item.to)]),
    ),
  });

  return (
    <>
      <AppSidebar user={user} demo={demo} onSearch={openPalette} />
      {/* Every screen is h-svh; on a phone the cap ends it above the tab bar,
          so its last row scrolls into view. Nothing inside a screen is under
          the bar, so there the variable reads 0px: a bar placed at
          bottom: var(--portal-tabbar-h) in a screen sits right on the tab bar. */}
      <SidebarInset className="h-[calc(100svh-var(--portal-tabbar-h))] min-w-0 *:max-h-full *:[--portal-tabbar-h:0px]">
        <Outlet routes={ROUTES} notFound={notFound} />
      </SidebarInset>
      <BottomTabs />
      {palette !== null && <CommandPalette open={palette} onOpenChange={setPalette} onShortcuts={openShortcuts} />}
      {shortcuts !== null && <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />}
      <HeldTitle />
    </>
  );
}

/** "(3) Dev Portal" while comments wait, so a background tab says so. */
function HeldTitle() {
  const held = useCommentCounts().data?.held ?? 0;
  React.useEffect(() => {
    document.title = held > 0 ? `(${held}) Dev Portal` : 'Dev Portal';
  }, [held]);
  return null;
}

/* Below 1280px the bottom-right corner is where the thumb and the detail
   drawer are, so toasts drop in from the top instead, below the 52px header
   and a drawer's top row (close, previous, next). They are clipped at that
   line too: sliding in and out they would pass over those buttons and take
   a tap meant for one. On touch only the newest shows: a tap on a stack
   expands it and pauses it, and the expanded stack covered the list. A
   wrapper, so a breakpoint change re-renders the provider and not the app
   under it. */
const BELOW_HEADER =
  '[&>[data-slot=toast-viewport][data-position*=top]]:top-[calc(3.5rem+env(safe-area-inset-top))] [&>[data-slot=toast-viewport][data-position*=top]]:[clip-path:inset(0_-100vw_-100vh)]';

function Toasts({ children }: { children: React.ReactNode }) {
  const wide = useMediaQuery('min-xl');
  const coarse = useMediaQuery('(pointer: coarse)');
  return (
    <ToastProvider position={wide ? 'bottom-right' : 'top-center'} limit={coarse ? 1 : 3} portalProps={{ className: BELOW_HEADER }}>
      {children}
    </ToastProvider>
  );
}

export default function PortalApp({ user, demo, sidebarOpen }: { user: PortalUser | null; demo: boolean; sidebarOpen: boolean }) {
  const [client] = React.useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delay={400}>
        <Toasts>
          {/* The phone tab bar's height, safe area included; 0px where there is none. */}
          <SidebarProvider
            defaultOpen={sidebarOpen}
            className="[--portal-tabbar-h:0px] max-md:[--portal-tabbar-h:calc(3.5rem+env(safe-area-inset-bottom))]"
          >
            <Shell user={user} demo={demo} />
          </SidebarProvider>
        </Toasts>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
