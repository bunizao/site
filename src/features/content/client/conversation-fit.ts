// A wrapped bubble does not hug its own text.
//
// `width: fit-content` sizes a box to min(max-content, available). Once a
// message is long enough to wrap, max-content loses and the box locks to
// max-width — but the line breaker rarely gets to spend all of it. Whatever it
// could not use stays inside the right border as dead space: 27px on a
// phone-width CJK thread, where a trailing 「吗？」 cannot be split and drops to
// the next line whole. Against 14px of padding on the other side, that reads as
// a mis-padded box rather than as a bubble.
//
// CSS has no second pass to spend here. `text-wrap: balance` makes it worse — it
// shortens every line inside the same box, taking the gap from 27px to 156px —
// and `hanging-punctuation`, which is the real typographic answer, is Safari
// only. So measure the line boxes and set the width to the widest one, the way
// a native chat client does.
//
// Line breaking cannot change as a result: the width set is never below the
// widest line already laid out, so every break stays where the browser put it
// and this only gives back space nothing was using. With no JS the bubble keeps
// the CSS behaviour, which is today's.

// A range over the bubble would hand back the `p`'s own border box — the full
// content width, which is the number this is trying to get away from. Ranging
// inside each block child is what yields line boxes.
//
// One rect per line fragment, and an inline `code` or `a` splits a line into
// several, so collapse them onto lines by their top edge first. Rounded,
// because fragments of one line can differ in the sub-pixel.
function widestLine(bubble: HTMLElement): number {
  const blocks = bubble.children.length ? [...bubble.children] : [bubble];
  const range = document.createRange();
  const lines = new Map<number, { left: number; right: number }>();

  for (const block of blocks) {
    range.selectNodeContents(block);
    for (const rect of range.getClientRects()) {
      if (!rect.width) continue;
      const key = Math.round(rect.top);
      const line = lines.get(key);
      if (!line) lines.set(key, { left: rect.left, right: rect.right });
      else {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
      }
    }
  }

  let widest = 0;
  for (const { left, right } of lines.values()) widest = Math.max(widest, right - left);

  return widest;
}

function fitBubble(bubble: HTMLElement): void {
  // Clear first: otherwise the pass measures the width the previous pass set,
  // and the bubble can only ever get narrower.
  bubble.style.width = '';

  const widest = widestLine(bubble);
  // A thread inside a closed `details`, or one not yet in the document, has no
  // boxes to measure. Leave it to the stylesheet.
  if (!widest) return;

  const style = getComputedStyle(bubble);
  const frame =
    style.boxSizing === 'border-box'
      ? parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.borderRightWidth)
      : 0;

  // Ceil, never floor: a width a fraction of a pixel under the widest line
  // would re-wrap the very line it was measured from.
  bubble.style.width = `${Math.ceil(widest) + frame}px`;
}

function fitThread(thread: Element): void {
  thread.querySelectorAll<HTMLElement>('.conv-bubble').forEach(fitBubble);
}

// Container queries mean a thread reflows with its column, not with the window,
// so the trigger has to be the column. Bubble widths cannot feed back into
// .conv — it is a block and takes its width from the prose column either way —
// so this cannot loop.
const observer =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => {
        for (const entry of entries) fitThread(entry.target);
      });

/** Fit every thread under `root`, and keep fitting it while the column resizes. */
export function observeConversations(root: ParentNode | null): () => void {
  if (!root || !observer) return () => {};

  const threads = [...root.querySelectorAll('.conv')];
  threads.forEach((thread) => observer.observe(thread));

  return () => threads.forEach((thread) => observer.unobserve(thread));
}

// A web font that arrives after first paint changes every measurement, and no
// resize accompanies it.
export function refitOnFontLoad(): void {
  document.fonts?.ready.then(() => {
    document.querySelectorAll('.conv').forEach(fitThread);
  });
}
