import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from '@/components/coss/dialog';
import { Kbd, KbdGroup } from '@/components/coss/kbd';
import { flatNav } from '../nav';

const SECTIONS: Array<{ title: string; rows: Array<[string[], string]> }> = [
  {
    title: 'Anywhere',
    rows: [
      [['⌘', 'K'], 'Search and jump'],
      [['⌘', 'B'], 'Toggle the sidebar'],
      [['?'], 'This list'],
      [['Z'], 'Undo the last action'],
    ],
  },
  {
    title: 'Comments',
    rows: [
      [['J'], 'Next comment'],
      [['K'], 'Previous comment'],
      [['A'], 'Approve'],
      [['U'], 'Unpublish'],
      [['D'], 'Delete (6 seconds to undo)'],
      [['B'], 'Ban the writer'],
      [['X'], 'Select for bulk'],
      [['⇧', 'A'], 'Approve the selection'],
      [['⇧', 'D'], 'Delete the selection'],
      [['/'], 'Filter loaded comments'],
      [['1', '–', '5'], 'Held, Published, Rejected, Deleted, All'],
      [['Esc'], 'Clear selection or close'],
    ],
  },
  {
    title: 'Go to',
    rows: flatNav()
      .filter((item) => item.chord)
      .map((item) => [['G', item.chord!.toUpperCase()], item.label]),
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work anywhere outside a text field.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-6 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <section key={section.title} className={section.title === 'Comments' ? 'sm:row-span-2' : undefined}>
              <h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">{section.title}</h3>
              <dl className="flex flex-col gap-1.5">
                {section.rows.map(([keys, label]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-sm">
                    <dt>{label}</dt>
                    <dd>
                      <KbdGroup>
                        {keys.map((key, index) => (key === '–' ? <span key={index} className="text-muted-foreground">–</span> : <Kbd key={index}>{key}</Kbd>))}
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
