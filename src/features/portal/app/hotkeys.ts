import * as React from 'react';

/* Single-key shortcuts in the Gmail/Linear tradition: `j`, `shift+a`,
   `mod+k`, and `g c` style chords. Typing in a field never triggers a plain
   key; only `mod+` combinations and Escape reach through. */

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

const CHORD_TIMEOUT_MS = 900;
let chordLead: { key: string; at: number } | null = null;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range'].includes(type);
}

function describe(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  // `?` and friends arrive with shift already applied to the character, so
  // shift is only spelled out for letters and named keys.
  if (event.shiftKey && (event.key.length !== 1 || /[a-z]/i.test(event.key))) parts.push('shift');
  parts.push(event.key === ' ' ? 'space' : event.key.toLowerCase());
  return parts.join('+');
}

export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = React.useRef(map);
  ref.current = map;

  React.useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const combo = describe(event);
      const typing = isTyping(event.target);
      if (typing && !combo.startsWith('mod+') && combo !== 'escape') return;
      // An open dialog or menu owns plain keys; the palette shortcut still works.
      if (!combo.startsWith('mod+') && document.querySelector('[role="dialog"][data-open], [role="menu"][data-open]')) return;

      const handlers = ref.current;
      if (chordLead && Date.now() - chordLead.at < CHORD_TIMEOUT_MS) {
        const chord = `${chordLead.key} ${combo}`;
        chordLead = null;
        if (handlers[chord]) {
          event.preventDefault();
          handlers[chord](event);
          return;
        }
      }
      if (Object.keys(handlers).some((name) => name.startsWith(`${combo} `))) {
        chordLead = { key: combo, at: Date.now() };
        event.preventDefault();
        return;
      }
      const handler = handlers[combo];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
