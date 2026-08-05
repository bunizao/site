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

  // Position by transform, size by width/height. Sizing via scale() on a 1x1 box
  // is cheaper, but it scales border-radius with the box: a 12px radius on a
  // ~700x50 pill renders as an 8400x600 corner, which both axes then clamp to
  // half the box — the pill comes out an ellipse. The radius is the shape here,
  // so it cannot ride the scale.
  const moveTo = (item: HTMLElement) => {
    const ir = item.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    pill.style.width = `${ir.width + padX * 2}px`;
    pill.style.height = `${ir.height + padY * 2}px`;
    pill.style.transform = `translate(${ir.left - lr.left - padX}px, ${ir.top - lr.top - padY}px)`;
    pill.style.opacity = '1';
  };

  // Last pointer position, kept so a scroll can re-resolve which item sits under
  // a stationary cursor. Scrolling moves items past the pointer without firing
  // pointerover, which otherwise strands the pill on the item you left — while
  // the CSS `:hover` dim, which the browser does re-evaluate after a scroll,
  // moves on without it.
  let pointerX = 0;
  let pointerY = 0;
  let scrolling = false;
  let scrollRaf = 0;

  const enter = (item: HTMLElement) => {
    list.classList.add('is-hovering');
    moveTo(item);
  };

  const leave = () => {
    list.classList.remove('is-hovering');
    pill.style.opacity = '0';
  };

  // Scroll fires far more often than it can be usefully answered, and answering
  // it costs an elementFromPoint plus two rect reads — all forced layout. One
  // answer per frame is the most the pill can show anyway.
  const onScroll = () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      if (!list.classList.contains('is-hovering')) return;
      const item = (document.elementFromPoint(pointerX, pointerY) as HTMLElement | null)
        ?.closest<HTMLElement>(itemSelector);
      if (item && list.contains(item)) moveTo(item);
      else leave();
    });
  };

  list.addEventListener('pointerover', (event) => {
    const item = (event.target as HTMLElement).closest<HTMLElement>(itemSelector);
    if (item && list.contains(item)) {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!scrolling) {
        document.addEventListener('scroll', onScroll, { passive: true, capture: true });
        scrolling = true;
      }
      enter(item);
    }
  });

  list.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  }, { passive: true });

  list.addEventListener('pointerleave', () => {
    if (scrollRaf) {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
    }
    if (scrolling) {
      document.removeEventListener('scroll', onScroll, { capture: true });
      scrolling = false;
    }
    leave();
  });
}
