import type * as React from 'react';
import { Separator } from '@/components/coss/separator';
import { SidebarTrigger } from '@/components/coss/sidebar';

/** The one bar every screen starts with: sidebar toggle, the screen's
    name as its h1, then whatever controls the screen owns. */
export function ScreenHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <SidebarTrigger aria-label="Toggle sidebar (⌘B)" />
      <Separator orientation="vertical" className="h-4" />
      <h1 className="truncate font-semibold text-sm">{title}</h1>
      {children}
    </header>
  );
}
