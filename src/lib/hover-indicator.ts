// Sliding hover pill, ripped from cai.im: a single soft rectangle that glides
// behind whichever list item the pointer is over (springy transform), while the
// CSS dims the un-hovered siblings. Pure DOM, no deps. Pointer-only so touch
// devices never get a stuck highlight.
//
// The caller owns the look: style `.${indicatorClass}` and the sibling-dim rule
// (`.${list-class}.is-hovering .item:not(:hover)`) in the relevant stylesheet.

interface Options {
  /** CSS selector for the hoverable items within the list. */
  itemSelector: string;
  /** Class for the injected pill element. Defaults to "hover-indicator". */
  indicatorClass?: string;
  /** Horizontal bleed of the pill beyond the item, in px. */
  padX?: number;
  /** Vertical bleed of the pill beyond the item, in px. */
  padY?: number;
}

export function attachHoverIndicator(list: HTMLElement, options: Options): void {
  // Gate on hover capability only — NOT `pointer: fine`. Some hover-capable
  // Safari setups report a coarse primary pointer (a trackpad in certain modes,
  // an iPad used as a Sidecar display, a drawing tablet); requiring `fine` there
  // silently dropped the whole highlight. Touch-only devices still report
  // `hover: none` and are correctly excluded.
  if (!window.matchMedia?.('(hover: hover)').matches) return;

  const { itemSelector, indicatorClass = 'hover-indicator', padX = 14, padY = 6 } = options;

  if (getComputedStyle(list).position === 'static') list.style.position = 'relative';

  let indicator = list.querySelector<HTMLElement>(`:scope > .${indicatorClass}`);
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = indicatorClass;
    indicator.setAttribute('aria-hidden', 'true');
    list.prepend(indicator);
  }
  const pill = indicator;

  const moveTo = (item: HTMLElement) => {
    const ir = item.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    pill.style.width = `${ir.width + padX * 2}px`;
    pill.style.height = `${ir.height + padY * 2}px`;
    pill.style.transform = `translate(${ir.left - lr.left - padX}px, ${ir.top - lr.top - padY}px)`;
    pill.style.opacity = '1';
  };

  list.addEventListener('pointerover', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(itemSelector);
    if (item && list.contains(item)) {
      list.classList.add('is-hovering');
      moveTo(item);
    }
  });

  list.addEventListener('pointerleave', () => {
    list.classList.remove('is-hovering');
    pill.style.opacity = '0';
  });
}
