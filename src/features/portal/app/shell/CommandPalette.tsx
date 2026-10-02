import * as React from 'react';
import type { AdminCommentSitePolicy } from '@bunizao/contracts';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  ExternalLink,
  Filter,
  KeyRound,
  Keyboard,
  Lock,
  LockOpen,
  MailCheck,
  MailX,
  MessageSquareOff,
  MessagesSquare,
  PanelLeft,
  ShieldAlert,
  UserX,
  Users,
} from 'lucide-react';
import { useAutocompleteFilter } from '@/components/coss/autocomplete';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from '@/components/coss/command';
import { Kbd, KbdGroup } from '@/components/coss/kbd';
import { useSidebar } from '@/components/coss/sidebar';
import { STATUS_FILTERS, STATUS_LABELS } from '../../comments/data';
import { openOwnerSignIn } from '../../comments/OwnerSignIn';
import { useSetSitePolicy, useSitePolicy } from '../../comments/site-policy';
import { flatNav } from '../nav';
import { navigate } from '../router';

interface PaletteItem {
  value: string;
  label: string;
  keywords?: string;
  shortcut?: string;
  Icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  /** Shown for any query: it acts on the query rather than matching it. */
  search?: boolean;
}

interface PaletteGroup {
  value: string;
  items: PaletteItem[];
}

/** The Search group for a typed query: open a screen's list with its own
    search set to it (`?q=`, as each screen's search box writes it). Only a
    navigation; the screen reads when it opens. An address goes to
    Subscribers first. */
export function searchGroup(query: string): PaletteGroup | null {
  const q = query.trim();
  if (!q) return null;
  const comments: PaletteItem = {
    value: 'search:comments',
    label: `Comments matching “${q}”`,
    Icon: MessagesSquare,
    search: true,
    run: () => navigate(`/comments?${new URLSearchParams({ q })}`),
  };
  const subscribers: PaletteItem = {
    value: 'search:subscribers',
    label: `Subscribers matching “${q}”`,
    Icon: Users,
    search: true,
    run: () => navigate(`/subscribers?${new URLSearchParams({ q })}`),
  };
  return { value: 'Search', items: q.includes('@') ? [subscribers, comments] : [comments, subscribers] };
}

export function CommandPalette({ open, onOpenChange, onShortcuts }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShortcuts: () => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <Palette onClose={() => onOpenChange(false)} onShortcuts={onShortcuts} />
      </CommandDialogPopup>
    </CommandDialog>
  );
}

/** The site-wide switches' transitions from where they stand now: none
    until the switches are read, so a command never names a state the site
    is already in. */
function sitePolicyItems(policy: AdminCommentSitePolicy | undefined, set: ReturnType<typeof useSetSitePolicy>): PaletteItem[] {
  if (!policy) return [];
  const items: PaletteItem[] = [];
  const keywords = 'site-wide all posts';
  if (policy.mode !== null) {
    items.push({ value: 'site-open', label: 'Reopen comments everywhere', keywords: `${keywords} open unlock`, Icon: LockOpen, run: () => void set({ mode: null }) });
  }
  if (policy.mode !== 'readonly') {
    items.push({ value: 'site-readonly', label: 'Close comments everywhere', keywords: `${keywords} read-only lock freeze`, Icon: Lock, run: () => void set({ mode: 'readonly' }) });
  }
  if (policy.mode !== 'off') {
    items.push({ value: 'site-off', label: 'Hide comments everywhere', keywords: `${keywords} off disable`, Icon: MessageSquareOff, run: () => void set({ mode: 'off' }) });
  }
  items.push(
    policy.requireEmail
      ? { value: 'site-email-off', label: 'Stop requiring an email everywhere', keywords: `${keywords} anonymous address optional`, Icon: MailX, run: () => void set({ requireEmail: false }) }
      : { value: 'site-email-on', label: 'Require a confirmed email everywhere', keywords: `${keywords} anonymous address verify`, Icon: MailCheck, run: () => void set({ requireEmail: true }) },
  );
  return items;
}

/** Inside the popup, so the query starts empty on every open. */
function Palette({ onClose, onShortcuts }: { onClose: () => void; onShortcuts: () => void }) {
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const { contains } = useAutocompleteFilter();
  const [query, setQuery] = React.useState('');
  const policy = useSitePolicy().data?.policy;
  const setSitePolicy = useSetSitePolicy();

  const groups = React.useMemo<PaletteGroup[]>(() => [
    {
      value: 'Go to',
      items: flatNav().map((item) => ({
        value: `nav:${item.id}`,
        label: item.label,
        keywords: item.keywords,
        shortcut: item.chord ? `G ${item.chord.toUpperCase()}` : undefined,
        Icon: item.Icon,
        run: () => navigate(item.to),
      })),
    },
    {
      value: 'Comments',
      items: [
        ...STATUS_FILTERS.map((status, index): PaletteItem => ({
          value: `status:${status}`,
          label: `Show ${STATUS_LABELS[status].toLowerCase()} comments`,
          keywords: 'filter comments',
          shortcut: String(index + 1),
          Icon: Filter,
          run: () => navigate(`/comments?status=${status}`),
        })),
        { value: 'owner-sign-in', label: 'Write as the owner', keywords: 'owner sign in blog badge', Icon: KeyRound, run: openOwnerSignIn },
        { value: 'bans-readers', label: 'Blocked reader accounts', keywords: 'revoked readers restore unban', Icon: UserX, run: () => navigate('/comments/bans?view=readers') },
        ...sitePolicyItems(policy, setSitePolicy),
      ],
    },
    {
      value: 'Messages',
      items: [
        { value: 'messages-archived', label: 'Archived messages', keywords: 'messages filed', Icon: Archive, run: () => navigate('/messages?view=archived') },
        { value: 'messages-spam', label: 'Spam messages', keywords: 'messages junk', Icon: ShieldAlert, run: () => navigate('/messages?view=spam') },
      ],
    },
    {
      value: 'General',
      items: [
        { value: 'sidebar', label: 'Toggle sidebar', shortcut: '⌘B', Icon: PanelLeft, run: toggleSidebar },
        { value: 'shortcuts', label: 'Keyboard shortcuts', shortcut: '?', Icon: Keyboard, run: onShortcuts },
        { value: 'site', label: 'Open the public site', keywords: 'blog home', Icon: ExternalLink, run: () => window.open('/', '_blank', 'noreferrer') },
      ],
    },
  ], [toggleSidebar, onShortcuts, policy, setSitePolicy]);

  // Last, so a screen or command the query names stays on top.
  const search = searchGroup(query);
  const items = search ? [...groups, search] : groups;

  const run = (item: PaletteItem): void => {
    onClose();
    // On a phone the palette may sit over the sidebar sheet; the sheet goes
    // too, except for the item that toggles it.
    if (item.value !== 'sidebar') setOpenMobile(false);
    item.run();
  };

  return (
    <Command
      items={items}
      value={query}
      onValueChange={setQuery}
      itemToStringValue={(item: unknown) => {
        const entry = item as PaletteItem;
        return `${entry.label} ${entry.keywords ?? ''}`;
      }}
      filter={(item: unknown, text: string, toString?: (item: unknown) => string) => Boolean((item as PaletteItem).search) || contains(item, text, toString)}
    >
      <CommandInput placeholder="Jump to a screen, run a command or search" />
      <CommandPanel>
        <CommandList>
          {(group: PaletteGroup) => (
            <CommandGroup key={group.value} items={group.items}>
              <CommandGroupLabel>{group.value}</CommandGroupLabel>
              <CommandCollection>
                {(item: PaletteItem) => (
                  <CommandItem key={item.value} value={item} className="gap-2 pointer-coarse:min-h-11" onClick={() => run(item)}>
                    <item.Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                )}
              </CommandCollection>
            </CommandGroup>
          )}
        </CommandList>
      </CommandPanel>
      {/* Key hints mean nothing on a phone. */}
      <CommandFooter className="max-md:hidden">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <KbdGroup>
              <Kbd><ArrowUp /></Kbd>
              <Kbd><ArrowDown /></Kbd>
            </KbdGroup>
            Move
          </span>
          <span className="flex items-center gap-2">
            <Kbd><CornerDownLeft /></Kbd>
            Open
          </span>
        </div>
        <span className="flex items-center gap-2">
          <Kbd>Esc</Kbd>
          Close
        </span>
      </CommandFooter>
    </Command>
  );
}
