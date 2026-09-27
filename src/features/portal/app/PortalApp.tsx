import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarInset, SidebarProvider } from '@/components/coss/sidebar';
import { Spinner } from '@/components/coss/spinner';
import { ToastProvider } from '@/components/coss/toast';
import { TooltipProvider } from '@/components/coss/tooltip';
import { ApiError } from './api';
import { useHotkeys } from './hotkeys';
import { flatNav } from './nav';
import { navigate, registerAppRoutes, useLocation } from './router';
import { AppSidebar, type PortalUser } from './shell/AppSidebar';
import { CommandPalette } from './shell/CommandPalette';
import { ShortcutsDialog } from './shell/ShortcutsDialog';

/* Screens this app renders. A path not listed here is still a server page,
   and links to it fall back to a normal navigation (see router.tsx). */
const ROUTES: Array<{ pattern: RegExp; Screen: React.LazyExoticComponent<React.ComponentType> }> = [
  { pattern: /^\/comments$/, Screen: React.lazy(() => import('../comments/CommentsScreen')) },
];

registerAppRoutes(ROUTES.map((route) => route.pattern));

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
  return (
    <div className="flex h-svh flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
      <p>
        Nothing lives at <code className="font-code">{path}</code>.
      </p>
      <button type="button" className="underline underline-offset-2" onClick={() => navigate('/comments')}>
        Go to the comment inbox
      </button>
    </div>
  );
}

function Outlet() {
  const { path } = useLocation();
  const route = ROUTES.find((entry) => entry.pattern.test(path));
  if (!route) return <NotFound path={path} />;
  return (
    <React.Suspense
      fallback={
        <div className="flex h-svh items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      }
    >
      <route.Screen />
    </React.Suspense>
  );
}

function Shell({ user, demo }: { user: PortalUser | null; demo: boolean }) {
  const [palette, setPalette] = React.useState(false);
  const [shortcuts, setShortcuts] = React.useState(false);
  const openShortcuts = React.useCallback(() => setShortcuts(true), []);

  useHotkeys({
    'mod+k': () => setPalette((open) => !open),
    '?': () => setShortcuts(true),
    ...Object.fromEntries(
      flatNav()
        .filter((item) => item.chord)
        .map((item) => [`g ${item.chord}`, () => navigate(item.to)]),
    ),
  });

  return (
    <>
      <AppSidebar user={user} demo={demo} onSearch={() => setPalette(true)} />
      <SidebarInset className="min-w-0">
        <Outlet />
      </SidebarInset>
      <CommandPalette open={palette} onOpenChange={setPalette} onShortcuts={openShortcuts} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
    </>
  );
}

export default function PortalApp({ user, demo, sidebarOpen }: { user: PortalUser | null; demo: boolean; sidebarOpen: boolean }) {
  const [client] = React.useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delay={400}>
        <ToastProvider>
          <SidebarProvider defaultOpen={sidebarOpen}>
            <Shell user={user} demo={demo} />
          </SidebarProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
