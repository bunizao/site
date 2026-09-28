import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Kbd, KbdGroup } from '@/components/coss/kbd';
import { flatNav } from '../nav';
import { usePath } from '../router';

type Row = [keys: string[], label: string];
interface Section {
  title: string;
  rows: Row[];
}

const MOVE: Row[] = [
  [['J', 'or', '↓'], 'Next row'],
  [['K', 'or', '↑'], 'Previous row'],
];
const UNDO: Row = [['Z'], 'Undo the last action'];

/* Written between keys, not as one: a range or an alternative. */
const SEPARATORS = new Set(['–', 'or']);

/* The keys each screen binds (its useHotkeys call), written out by hand:
   a static list is easier to read than one derived from handlers, and a
   screen that changes its keys changes this list in the same diff. */
const SCREENS: Array<{ path: RegExp } & Section> = [
  {
    path: /^\/comments$/,
    title: 'Comments',
    rows: [
      [['J', 'or', '↓'], 'Next comment'],
      [['K', 'or', '↑'], 'Previous comment'],
      [['A'], 'Approve'],
      [['U'], 'Unpublish'],
      [['S'], 'Reject with a reason'],
      [['1', '–', '5'], 'Pick the reason, in the reject menu'],
      [['D'], 'Delete (6 seconds to undo)'],
      UNDO,
      [['R'], 'Reply as the owner'],
      [['⌘', '↵'], 'Send the reply'],
      [['B'], 'Ban the writer'],
      [['P'], 'Pin to the top of its post, or unpin'],
      [['L'], 'Lock or unlock replies to the thread'],
      [['X'], 'Select for bulk'],
      [['⇧', 'J', 'or', '⇧', 'K'], 'Extend the selection'],
      [['⇧', 'A'], 'Approve the selection'],
      [['⇧', 'S'], 'Reject the selection'],
      [['⇧', 'D'], 'Delete the selection'],
      [['/'], 'Search the last 30 days'],
      [['1', '–', '5'], 'All, Held, Published, Rejected, Deleted'],
      [['Esc'], 'Clear selection or close'],
    ],
  },
  {
    path: /^\/comments\/reactions$/,
    title: 'Reactions',
    rows: [
      ...MOVE,
      [['B'], 'Ban the reactor'],
      [['S'], 'Everything from this session'],
      UNDO,
      [['/'], 'Search reactions'],
      [['1', '–', '3'], 'All, On posts, On comments'],
      [['Esc'], 'Leave search or clear the cursor'],
    ],
  },
  {
    path: /^\/comments\/bans$/,
    title: 'Bans',
    rows: [
      ...MOVE,
      [['L'], 'Lift the ban'],
      UNDO,
      [['↵'], 'Comments from this key'],
      [['N'], 'New ban'],
      [['/'], 'Search bans'],
      [['R'], 'Restore the reader, in Readers'],
      [['↵'], 'Confirm the restore'],
      [['1', '–', '4'], 'Active, Expired, Removals, Readers'],
      [['Esc'], 'Leave search, cancel, or clear the cursor'],
    ],
  },
  {
    path: /^\/comments\/modes$/,
    title: 'Post modes',
    rows: [
      ...MOVE,
      [['←', 'or', '→'], 'Change the override'],
      UNDO,
      [['/'], 'Find a post'],
      [['Esc'], 'Clear or leave search'],
    ],
  },
  {
    path: /^\/messages(\/[^/]+)?$/,
    title: 'Messages',
    rows: [
      ...MOVE,
      [['E'], 'Archive, or move back to Inbox'],
      [['!'], 'Spam, or not spam'],
      UNDO,
      [['R'], 'Reply by email'],
      [['⌘', '↵'], 'Send the reply'],
      [['1', '–', '3'], 'Inbox, Archived, Spam'],
      [['Esc'], 'Close'],
    ],
  },
  {
    path: /^\/subscribers(\/[^/]+)?$/,
    title: 'Subscribers',
    rows: [
      ...MOVE,
      [['U'], 'Unsubscribe'],
      [['D'], 'Delete'],
      UNDO,
      [['X'], 'Select for bulk'],
      [['N'], 'Add a subscriber'],
      [['/'], 'Search subscribers'],
      [['1', '–', '4'], 'All, Active, Pending, Unsubscribed'],
      [['Esc'], 'Clear selection or close'],
    ],
  },
  {
    path: /^\/broadcasts(\/[^/]+)?$/,
    title: 'Broadcasts',
    rows: [
      ...MOVE,
      [['N'], 'New broadcast'],
      [['C'], 'Duplicate'],
      [['⌘', '↵'], 'Review, then send, in the composer'],
      [['Esc'], 'Close'],
    ],
  },
  { path: /^\/blog$/, title: 'Blog previews', rows: [[['J'], 'Next post'], [['K'], 'Previous post'], [['Esc'], 'Back to the list']] },
  { path: /^\/newsletter$/, title: 'Email templates', rows: [[['J'], 'Next template'], [['K'], 'Previous template']] },
  { path: /^\/mood$/, title: 'Mood', rows: [[['/'], 'Search']] },
  { path: /^\/analytics\/[^/]+$/, title: 'Article', rows: [[['Esc'], 'Back to the list']] },
];

const ANYWHERE: Section = {
  title: 'Anywhere',
  rows: [
    [['⌘', 'K'], 'Search and jump'],
    [['⌘', 'B'], 'Toggle the sidebar'],
    [['?'], 'This list'],
  ],
};

const GO_TO: Section = {
  title: 'Go to',
  rows: flatNav()
    .filter((item) => item.chord)
    .map((item): Row => [['G', item.chord!.toUpperCase()], item.label]),
};

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const path = usePath();
  const screen = SCREENS.find((entry) => entry.path.test(path));
  // The open screen's keys first: that is what the reader came for.
  const sections = screen ? [screen, ANYWHERE, GO_TO] : [ANYWHERE, GO_TO];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work anywhere outside a text field.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-6 sm:grid-cols-2">
          {sections.map((section) => (
            <section key={section.title} className={section === screen ? 'sm:row-span-2' : undefined}>
              <h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">{section.title}</h3>
              <dl className="flex flex-col gap-1.5">
                {section.rows.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-sm">
                    <dt>{label}</dt>
                    <dd>
                      <KbdGroup>
                        {keys.map((key, index) => (SEPARATORS.has(key) ? <span key={index} className="text-muted-foreground">{key}</span> : <Kbd key={index}>{key}</Kbd>))}
                      </KbdGroup>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
