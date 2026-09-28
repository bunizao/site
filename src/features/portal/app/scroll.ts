import * as React from 'react';
import { readHistoryState, useLocation } from './router';

/* Back lands where you left, per history entry.

   Screens scroll their own container (the page never scrolls), which the
   browser's restoration cannot see, so the shell does it: a position is
   remembered for (history entry, scope). A new entry starts at the top; Back
   and Forward land on the saved offset. The scope separates lists that
   share an entry, such as the comment log's status tabs, which only replace
   the URL.

   Positions live in memory, and are mirrored into that entry's
   `history.state` so a reload lands in place too. The mirror is debounced
   (Safari throttles replaceState) and flushed on the press that may be about
   to navigate. It only ever writes to the entry the position belongs to. */

const positions = new Map<string, number>();
const MAX_POSITIONS = 500;
const MIRROR_MS = 150;

const field = (scope: string): string => `scroll:${scope}`;

function remember(id: string, top: number): void {
  positions.delete(id); // Re-insert, so the oldest entry is the one dropped.
  positions.set(id, top);
  if (positions.size > MAX_POSITIONS) positions.delete(positions.keys().next().value!);
}

/** The offset saved for `scope` in history entry `entry`, if any. */
export function savedScroll(entry: string, scope: string): number | null {
  const kept = positions.get(`${entry} ${scope}`);
  if (kept !== undefined) return kept;
  const state = readHistoryState();
  const value = state.key === entry ? state[field(scope)] : undefined;
  return typeof value === 'number' ? value : null;
}

/** For screens that draw progressively: how far down the first frame must
    reach so the restore does not land short. */
export function useSavedScroll(scope: string): number | null {
  return savedScroll(useLocation().key, scope);
}

function track(node: HTMLElement, entry: string, scope: string): () => void {
  const id = `${entry} ${scope}`;
  let timer = 0;
  const mirror = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    const state = readHistoryState();
    // After a push or Back the current entry is another one; memory has it.
    if (state.key !== entry) return;
    history.replaceState({ ...state, [field(scope)]: positions.get(id) ?? 0 }, '');
  };
  const onScroll = (): void => {
    remember(id, node.scrollTop);
    window.clearTimeout(timer);
    timer = window.setTimeout(mirror, MIRROR_MS);
  };
  const flush = (): void => {
    if (timer) mirror();
  };
  node.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('pointerdown', flush, true);
  document.addEventListener('keydown', flush, true);
  return () => {
    flush();
    node.removeEventListener('scroll', onScroll);
    document.removeEventListener('pointerdown', flush, true);
    document.removeEventListener('keydown', flush, true);
  };
}

/** Restores `ref`'s scrollTop for this entry and scope once `ready` (the
    content is drawn), then keeps recording it. A new scope on the same
    container starts at its own saved offset, or the top. */
export function useScrollRestoration(ref: React.RefObject<HTMLElement | null>, scope: string, ready: boolean): void {
  const { key: entry } = useLocation();
  const id = `${entry} ${scope}`;
  const attached = React.useRef<{ node: HTMLElement; scope: string; id: string; detach: () => void } | null>(null);

  // No dependency list on purpose: it compares a few values after each
  // commit, and so also catches a swapped container (the comment log's wide
  // and narrow layouts render different ones).
  React.useLayoutEffect(() => {
    const node = ref.current;
    const current = attached.current;
    if (current?.node === node && current.id === id) return;
    // Detach before anything else: a list shrinking under the old scope
    // must not overwrite that scope's saved offset.
    current?.detach();
    attached.current = null;
    if (!node) return;
    if (current?.node === node && current.scope === scope) {
      // Same list, new entry: a detail was pushed over it, or Back closed
      // one. The list did not move, so it keeps its offset, now recorded
      // under this entry.
      remember(id, node.scrollTop);
    } else {
      if (!ready) return;
      const top = savedScroll(entry, scope) ?? 0;
      // Touching scrollTop forces a layout of the whole screen inside the
      // commit. A container this hook has not seen is new, so already at
      // the top; only a reused one (a new scope on the same list) needs
      // resetting.
      if (top !== 0 || current?.node === node) node.scrollTop = top;
    }
    attached.current = { node, scope, id, detach: track(node, entry, scope) };
  });

  React.useEffect(
    () => () => {
      attached.current?.detach();
      attached.current = null;
    },
    [],
  );
}

/** A ref callback for a bulk bar that floats over a list: while it is up,
    its positioned parent carries `--bulk-bar`, the height from the bar's top
    edge to the parent's bottom, and the list takes it as bottom padding
    (`pb-(--bulk-bar)`), so the last rows scroll clear of the bar. Measured,
    because the bar wraps to three lines on a phone; written as a variable,
    so the screen does not render again for it. */
export function padUnderBulkBar(bar: HTMLElement | null): (() => void) | undefined {
  const holder = bar?.offsetParent;
  if (!bar || !(holder instanceof HTMLElement)) return undefined;
  const observer = new ResizeObserver(() => holder.style.setProperty('--bulk-bar', `${holder.clientHeight - bar.offsetTop}px`));
  observer.observe(bar);
  return () => {
    observer.disconnect();
    holder.style.removeProperty('--bulk-bar');
  };
}
