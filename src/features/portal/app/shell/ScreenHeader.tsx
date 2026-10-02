import * as React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Separator } from '@/components/coss/separator';
import { SidebarTrigger } from '@/components/coss/sidebar';

type Health = 'ok' | 'offline' | 'retrying' | 'stale';

/* Whether what the screen shows is current. Only active queries count:
   the ones some mounted component observes, which is the open screen plus
   the sidebar's counts. A first load that fails is the screen's own error
   state, not this marker's business. */
function readHealth(client: QueryClient): Health {
  let stale = false;
  for (const query of client.getQueryCache().getAll()) {
    if (!query.isActive()) continue;
    const { fetchStatus, fetchFailureCount, status, data } = query.state;
    // react-query pauses fetches while the browser reports no network.
    if (fetchStatus === 'paused') return 'offline';
    if (fetchStatus === 'fetching' && fetchFailureCount > 0) return navigator.onLine ? 'retrying' : 'offline';
    if (status === 'error' && data !== undefined) stale = true;
  }
  return stale ? 'stale' : 'ok';
}

const LABELS: Record<Exclude<Health, 'ok'>, { text: string; title: string }> = {
  offline: { text: 'Offline · retrying', title: 'No network. The screen shows what it last loaded and refreshes when the network is back.' },
  retrying: { text: 'Retrying', title: 'A refresh failed and is being retried. The screen shows what it last loaded.' },
  stale: { text: 'Stale', title: 'A refresh failed. The screen shows what it last loaded; it tries again on the next poll or focus.' },
};

function StaleMarker() {
  const client = useQueryClient();
  const subscribe = React.useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]);
  const health = React.useSyncExternalStore(subscribe, () => readHealth(client), () => 'ok' as const);
  if (health === 'ok') return null;
  const label = LABELS[health];
  return (
    <span role="status" title={label.title} className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
      <span aria-hidden className={health === 'stale' ? 'size-1.5 rounded-full bg-warning' : 'size-1.5 animate-pulse rounded-full bg-warning'} />
      {label.text}
    </span>
  );
}

/** The one bar every screen starts with: sidebar toggle, the screen's
    name as its h1, whether its data is current, then whatever controls the
    screen owns. */
export function ScreenHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2.5 border-b px-4">
      <SidebarTrigger aria-label="Toggle sidebar (⌘B)" />
      <Separator orientation="vertical" className="h-4" />
      <h1 className="truncate font-semibold text-sm">{title}</h1>
      <StaleMarker />
      {children}
    </header>
  );
}
