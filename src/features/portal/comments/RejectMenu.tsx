import * as React from 'react';
import { Kbd } from '@/components/coss/kbd';
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from '@/components/coss/menu';
import { REJECT_REASONS, type RejectReason } from './data';
import { REASON_LABELS } from './model';

/* Reject with a reason, in one step: the menu opens from its button or S,
   and 1-5 pick a reason and act at once, with no confirm after. The reason
   the checks gave the comment, when they gave one, is marked. The caller
   owns `open`, so a hotkey can open the same menu the button does. */

export function RejectMenu({ open, onOpenChange, onPick, suggested = null, trigger, align = 'start', children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (reason: RejectReason) => void;
  suggested?: string | null;
  /** The trigger element without children, as MenuTrigger's `render`. */
  trigger: React.ReactElement;
  align?: 'start' | 'center' | 'end';
  children: React.ReactNode;
}) {
  // After a pick, focus belongs to the list the act moves on in, not to
  // this menu's button.
  const picked = React.useRef(false);
  const pick = (reason: RejectReason): void => {
    picked.current = true;
    onPick(reason);
  };
  const latest = React.useRef({ pick, onOpenChange });
  latest.current = { pick, onOpenChange };

  // Digits are caught on the window from the commit that opens the menu,
  // not on the popup: a 2 typed right after S lands before the popup has
  // focus, and would otherwise reach the page's 1-5 status keys.
  React.useLayoutEffect(() => {
    if (!open) return;
    picked.current = false;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const reason = /^[1-9]$/.test(event.key) ? REJECT_REASONS[Number(event.key) - 1] : undefined;
      if (!reason) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onOpenChange(false);
      latest.current.pick(reason);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger render={trigger}>{children}</MenuTrigger>
      <MenuPopup
        align={align}
        className="min-w-60"
        finalFocus={() => !picked.current}
      >
        <MenuGroup>
          <MenuGroupLabel>Reject as</MenuGroupLabel>
          {REJECT_REASONS.map((reason, index) => (
            <MenuItem key={reason} className="pointer-coarse:min-h-11" onClick={() => pick(reason)}>
              <span className="flex-1">{REASON_LABELS[reason]}</span>
              {suggested === reason && <span className="text-muted-foreground text-xs">suggested</span>}
              <Kbd className="pointer-coarse:hidden">{index + 1}</Kbd>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
