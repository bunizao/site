import * as React from 'react';
import { ArrowDown, ArrowUp, CornerDownLeft, ExternalLink, Filter, Keyboard, PanelLeft } from 'lucide-react';
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
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
import { flatNav } from '../nav';
import { navigate } from '../router';

interface PaletteItem {
  value: string;
  label: string;
  keywords?: string;
  shortcut?: string;
  Icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface PaletteGroup {
  value: string;
  items: PaletteItem[];
}

export function CommandPalette({ open, onOpenChange, onShortcuts }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShortcuts: () => void;
}) {
  const { toggleSidebar } = useSidebar();

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
      items: STATUS_FILTERS.map((status, index) => ({
        value: `status:${status}`,
        label: `Show ${STATUS_LABELS[status].toLowerCase()} comments`,
        keywords: 'filter comments',
        shortcut: String(index + 1),
        Icon: Filter,
        run: () => navigate(`/comments?status=${status}`),
      })),
    },
    {
      value: 'General',
      items: [
        { value: 'sidebar', label: 'Toggle sidebar', shortcut: '⌘B', Icon: PanelLeft, run: toggleSidebar },
        { value: 'shortcuts', label: 'Keyboard shortcuts', shortcut: '?', Icon: Keyboard, run: onShortcuts },
        { value: 'site', label: 'Open the public site', keywords: 'blog home', Icon: ExternalLink, run: () => window.open('/', '_blank', 'noreferrer') },
      ],
    },
  ], [toggleSidebar, onShortcuts]);

  const run = (item: PaletteItem): void => {
    onOpenChange(false);
    item.run();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <Command
          items={groups}
          itemToStringValue={(item: unknown) => {
            const entry = item as PaletteItem;
            return `${entry.label} ${entry.keywords ?? ''}`;
          }}
        >
          <CommandInput placeholder="Jump to a screen or run a command" />
          <CommandPanel>
            <CommandEmpty>Nothing matches. Try a screen name like “bans”.</CommandEmpty>
            <CommandList>
              {(group: PaletteGroup) => (
                <CommandGroup key={group.value} items={group.items}>
                  <CommandGroupLabel>{group.value}</CommandGroupLabel>
                  <CommandCollection>
                    {(item: PaletteItem) => (
                      <CommandItem key={item.value} value={item} onClick={() => run(item)}>
                        <item.Icon className="size-4 text-muted-foreground" />
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
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
      </CommandDialogPopup>
    </CommandDialog>
  );
}
