// Bubbles hug their longest line.
//
// A wrapped block is as wide as its cap, never as wide as the text that ended
// up inside it, so a bubble whose last line is short carries a hole on its
// right -- 52px of empty grey beside "straight to me." on a 414px phone. No
// CSS closes it: fit-content, balance and pretty all size the box before the
// lines exist, and moving the cap only moves which sentence at which width
// lands badly. Measured across 320-414px, the gap swings between 2px and 52px
// with no percentage that is good at every width, because where a line breaks
// is a property of the words, not of the container.
//
// Native messengers lay the text out, measure what they got and size the
// bubble to it. That is what this does, and it is the whole reason bubbles
// look drawn round their words in Messages and taped to a column on the web.
//
// Without script every bubble keeps the CSS cap, which is what the page did
// before this file existed.

const BUBBLES = '.bubble:not(.bubble--typing)';

// One entry per line box. Range rects break on every font run -- an emoji in
// the middle of a sentence is a rect of its own -- so they are grouped by
// their top edge before being measured.
const lineWidths = (bubble: HTMLElement): number[] => {
  const range = document.createRange();
  range.selectNodeContents(bubble);
  const lines = new Map<number, { left: number; right: number }>();
  for (const rect of range.getClientRects()) {
    if (!rect.width) continue;
    const key = Math.round(rect.top);
    const line = lines.get(key);
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
    } else {
      lines.set(key, { left: rect.left, right: rect.right });
    }
  }
  return [...lines.values()].map((line) => line.right - line.left);
};

export const fitBubble = (bubble: HTMLElement): void => {
  // Cleared first: a bubble being remeasured after a resize, or one that has
  // just become a single line, has to be read at its natural width.
  bubble.style.width = '';
  const layoutWidth = bubble.offsetWidth;
  if (!layoutWidth) return;

  let lines = lineWidths(bubble);
  if (lines.length < 2) return;

  // The opening run scales the bubbles as they arrive, and client rects come
  // back scaled with them. offsetWidth is layout and does not, so the ratio of
  // the two is the scale to divide out -- steadier than waiting for the
  // animation to finish, and correct for a bubble that is still in flight when
  // the window is resized.
  const scale = bubble.getBoundingClientRect().width / layoutWidth;
  const style = getComputedStyle(bubble);
  const gutters = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);

  // Narrowing the box rebreaks the text, and the new longest line can be
  // shorter again -- one measurement leaves a smaller version of the same
  // hole. Three passes is well past where these bubbles settle; the guard that
  // matters is the one below, not the count.
  for (let pass = 0; pass < 3; pass += 1) {
    // Rounded up, because a width a fraction under what the longest line needs
    // wraps it again.
    const target = Math.ceil(Math.max(...lines) / scale + gutters);
    if (target >= bubble.offsetWidth) return;

    const previous = bubble.style.width;
    bubble.style.width = `${target}px`;
    const rebroken = lineWidths(bubble);
    // Squeezing out the last few pixels is not worth an extra line: a bubble
    // that hugs its words but stands a line taller is the worse trade.
    if (rebroken.length > lines.length) {
      bubble.style.width = previous;
      return;
    }
    lines = rebroken;
  }
};

export const initBubbleFit = (root: HTMLElement): void => {
  const fitAll = (): void => {
    root.querySelectorAll<HTMLElement>(BUBBLES).forEach(fitBubble);
  };

  fitAll();
  // Line breaks move when Geist replaces the fallback face.
  void document.fonts.ready.then(fitAll);

  let queued = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(fitAll);
  });
};
