/* Browser entry for portal-ban-safety.test.ts: mounts one live portal
   component with the providers the portal app gives it, so a test can drive
   it in Chromium against routed API responses. Not a test file itself. */

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '@/components/coss/sidebar';
import { ToastProvider } from '@/components/coss/toast';
import { TooltipProvider } from '@/components/coss/tooltip';
import { BanDialog, type BanTarget } from '@/features/portal/comments/BanDialog';
import BansScreen from '@/features/portal/moderation/BansScreen';
import InsightsScreen from '@/features/portal/moderation/InsightsScreen';

function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SidebarProvider>
          <ToastProvider>{children}</ToastProvider>
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

const root = createRoot(document.getElementById('root')!);

declare global {
  interface Window {
    portalHarness: {
      banDialog: (target: BanTarget) => void;
      bansScreen: () => void;
      insightsScreen: () => void;
    };
  }
}

window.portalHarness = {
  banDialog: (target) => root.render(<Providers><BanDialog target={target} open onOpenChange={() => {}} /></Providers>),
  bansScreen: () => root.render(<Providers><BansScreen /></Providers>),
  insightsScreen: () => root.render(<Providers><InsightsScreen /></Providers>),
};
