import * as React from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/coss/button';
import { Kbd } from '@/components/coss/kbd';
import { Skeleton } from '@/components/coss/skeleton';
import { cn } from '@/lib/utils';
import { BLEED, Dot, GUTTER, LIST, PRESSABLE, Section, SMALL } from '../activity/table';
import { setSearch, useLocation } from '../app/router';
import { ScreenHeader } from '../app/shell/ScreenHeader';
import { ShortcutsDialog } from '../app/shell/ShortcutsDialog';
import { OwnerSignInDialog } from '../comments/OwnerSignIn';
import { prefetchReader, useReader } from './data';

/* The few things about the portal itself: who the blog thinks this browser
   is, where the shortcuts are, and where the reference lives. The comment
   policy (COMMENTS_MODE and friends) is Worker config with no read endpoint,
   so it is not shown rather than guessed. */

const ROW_GRID = cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5 text-sm', GUTTER, 'min-h-12 pointer-coarse:min-h-14');

/** The reader line, the one read on this screen (see app/lazy-screen.ts). */
export function prefetch(client: QueryClient): Promise<unknown> {
  return prefetchReader(client);
}

function OwnerLine({ dialogOpen }: { dialogOpen: boolean }) {
  const reader = useReader();

  // The dialog signs in or out on its own; read the result when it closes.
  const wasOpen = React.useRef(dialogOpen);
  React.useEffect(() => {
    if (wasOpen.current && !dialogOpen) void reader.refetch();
    wasOpen.current = dialogOpen;
  }, [dialogOpen, reader]);

  const signedIn = Boolean(reader.data);
  let status: React.ReactNode;
  if (reader.isPending) {
    status = <Skeleton className="h-4 w-48" />;
  } else if (reader.isError) {
    status = (
      <span className="flex items-center gap-2">
        <Dot tone="neutral" />
        <span className="font-medium">Unknown</span>
        <span className="text-muted-foreground">{(reader.error as Error).message} Open the dialog to check again.</span>
      </span>
    );
  } else if (reader.data) {
    // ReaderMe does not say whether the session is the owner's; the dialog
    // is where a non-owner session gets swapped for one.
    status = (
      <span className="flex flex-wrap items-center gap-x-2">
        <Dot tone="neutral" />
        <span className="font-medium">Signed in</span>
        <span className="text-muted-foreground">
          as {reader.data.displayName} via {reader.data.provider}
        </span>
      </span>
    );
  } else {
    status = (
      <span className="flex flex-wrap items-center gap-x-2">
        <Dot tone="neutral" />
        <span className="font-medium">Signed out</span>
        <span className="text-muted-foreground">This browser writes on the blog as nobody.</span>
      </span>
    );
  }

  return (
    <div className={ROW_GRID}>
      <div className="flex min-h-5 min-w-0 flex-col gap-1">
        <span>Blog identity</span>
        <span className="text-[13px]">{status}</span>
      </div>
      <Button size="sm" variant="outline" className={cn(SMALL, 'active:bg-accent')} onClick={() => setSearch({ dialog: 'owner' })}>
        {signedIn ? 'Manage' : 'Sign in as owner'}
      </Button>
    </div>
  );
}

const DOCS: Array<{ href: string; title: string; what: string }> = [
  { href: '/docs', title: 'Docs home', what: 'The living reference for the site and site-api' },
  { href: '/docs/api/endpoints', title: 'Admin routes', what: 'Every route this portal calls, with its auth tier' },
  { href: '/docs/api/site-routes', title: 'Site routes', what: 'What the public Worker answers itself, the portal included' },
  { href: '/docs/platform/comments', title: 'Comments', what: 'Moderation, bans, sweeps and recovery' },
  { href: '/docs/api/comments-risk', title: 'Risk stack', what: 'The checks, weights and thresholds every comment runs' },
  { href: '/docs/platform/notify', title: 'Newsletter', what: 'Subscriptions, templates and delivery' },
  { href: '/docs/surfaces/mood', title: 'Mood', what: 'Ingest, archive and the AI classifier' },
  { href: '/docs/surfaces/mascot', title: 'Mascot', what: 'Peek poses, runtime slots and stickers' },
  { href: '/docs/api/svg', title: 'SVG cards', what: 'The embeddable status and profile cards' },
  { href: '/docs/development', title: 'Development', what: 'Dev servers, demo mode and tests' },
];

export default function SettingsScreen() {
  const { search } = useLocation();
  const [shortcuts, setShortcuts] = React.useState(false);
  const ownerOpen = search.get('dialog') === 'owner';

  return (
    <div className="flex h-svh flex-col">
      <ScreenHeader title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 pt-1 pb-10 sm:gap-12">
          <Section title="Owner" headingId="settings-owner">
            <OwnerLine dialogOpen={ownerOpen} />
          </Section>

          <Section title="Keyboard" headingId="settings-keyboard">
            <div className={ROW_GRID}>
              <div className="flex min-w-0 flex-col gap-1">
                <span>Shortcuts</span>
                <span className="text-[13px] text-muted-foreground">
                  Press <Kbd>?</Kbd> on any screen, or <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd> to search and jump.
                </span>
              </div>
              <Button size="sm" variant="outline" className={cn(SMALL, 'active:bg-accent')} onClick={() => setShortcuts(true)}>
                Show shortcuts
              </Button>
            </div>
          </Section>

          <Section title="Reference" headingId="settings-docs" meta="opens in a new tab">
            <ul className={LIST}>
              {DOCS.map((doc) => (
                <li key={doc.href}>
                  <a
                    href={doc.href}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2 text-sm outline-none focus-visible:bg-accent/60',
                      BLEED,
                      'min-h-11 pointer-coarse:min-h-12',
                      PRESSABLE,
                    )}
                  >
                    <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="shrink-0 sm:w-32">{doc.title}</span>
                      <span className="min-w-0 truncate text-[13px] text-muted-foreground">{doc.what}</span>
                    </span>
                    <ArrowUpRight aria-hidden className="size-4 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
      <OwnerSignInDialog open={ownerOpen} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
    </div>
  );
}
