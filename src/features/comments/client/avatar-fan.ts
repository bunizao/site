// The picker behind the reader's own face. Pressing the face turns it into
// the button that deals five more, and throws five candidates out of it onto
// an arc to its right; picking one makes it the reader's face.
//
// Rightwards, because the face sits at the compose box's left edge and the
// box's width is the one direction with room. (Tried and dropped: a full
// ring, which read as a flower, and a fan opening upwards from the middle
// of the box, which lost its tie to the face.)
//
// Built for a finger first (Apple HIG, the way the owner judges it on iPad):
//
// - It opens on press, not on release, so the fan is already out while the
//   finger is still down. Sliding onto a face and lifting picks it, the way a
//   long-press menu works; a plain tap leaves the fan open for a second tap.
// - Every target is 44px, the HIG minimum, and nothing depends on hover.
// - Tapping anywhere else puts it away. The face itself is under the more
//   button while the fan is out, so it cannot be the way to close.
//
// The layer is a manual popover: top layer, so no stacking context on the
// page can clip it, and manual, so this file owns dismissal. An auto popover
// light-dismisses on pointerdown, which made pressing the face to close it
// close and then reopen it.

export interface AvatarFanLabels {
  group: string;
  option: (index: number) => string;
  more: string;
}

export interface AvatarFanOptions {
  /** Where the layer is attached, so it inherits the section's colours. */
  host: HTMLElement;
  labels: AvatarFanLabels;
  /** Static SVG markup for the more button, never interpolated data. */
  moreIcon: string;
  /** Five seeds, once per batch. Must resolve; fall back inside. */
  batch: () => Promise<number[]>;
  paint: (face: HTMLElement, seed: number) => void;
  choose: (seed: number, trigger: HTMLElement) => void;
}

/** From the face's centre to each candidate's: 36 degrees apart, neighbours
    clear each other by about 9px. */
const RADIUS = 86;
/** Degrees clockwise from pointing right: top to bottom down the right. */
const FACE_ANGLES = [-72, -36, 0, 36, 72];
const ITEM = 44;
/** Room the arc needs above and below the face. */
const REACH = Math.ceil(RADIUS * Math.sin((72 * Math.PI) / 180) + ITEM / 2 + 8);
/** Movement before a press counts as a drag rather than a tap. */
const DRAG_SLOP = 8;
/** Matches the close transition in comments.css. */
const CLOSE_MS = 220;
/** Long enough for the old five to fold in before the new five come out. */
const SWAP_MS = 140;

interface OpenFan {
  trigger: HTMLElement;
  layer: HTMLElement;
  items: HTMLButtonElement[];
  more: HTMLButtonElement;
  turns: number;
  deal: number;
}

interface Press {
  id: number;
  x: number;
  y: number;
  moved: boolean;
  wasOpen: boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function wireAvatarFan(selector: string, options: AvatarFanOptions): void {
  let fan: OpenFan | null = null;
  let press: Press | null = null;

  const place = () => {
    if (!fan) return;
    if (!fan.trigger.isConnected) {
      close(false);
      return;
    }
    const rect = fan.trigger.getBoundingClientRect();
    fan.layer.style.left = `${rect.left + rect.width / 2}px`;
    fan.layer.style.top = `${rect.top + rect.height / 2}px`;
  };

  function itemAt(x: number, y: number): HTMLButtonElement | null {
    const hit = document.elementFromPoint(x, y)?.closest<HTMLButtonElement>('.blog-avatar-fan__item');
    return hit && fan?.layer.contains(hit) ? hit : null;
  }

  function markHot(item: HTMLButtonElement | null): void {
    for (const each of fan?.items ?? []) each.classList.toggle('is-hot', each === item);
    fan?.more.classList.toggle('is-hot', fan.more === item);
  }

  /** Scrolls just enough for the whole fan to be on screen -- the visible
      part, which on a phone with the keyboard up is much less than the
      window. */
  function makeRoom(trigger: HTMLElement): void {
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const rect = trigger.getBoundingClientRect();
    const centre = rect.top + rect.height / 2;
    if (centre - REACH < top) window.scrollBy({ top: centre - REACH - top, behavior: 'instant' });
    else if (centre + REACH > bottom) window.scrollBy({ top: centre + REACH - bottom, behavior: 'instant' });
  }

  /** `angle` null is the centre. */
  function item(className: string, label: string, angle: number | null, index: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `blog-avatar-fan__item ${className}`;
    button.setAttribute('aria-label', label);
    const radians = ((angle ?? 0) * Math.PI) / 180;
    const radius = angle === null ? 0 : RADIUS;
    button.style.setProperty('--x', `${Math.round(Math.cos(radians) * radius)}px`);
    button.style.setProperty('--y', `${Math.round(Math.sin(radians) * radius)}px`);
    button.style.setProperty('--i', String(index));
    return button;
  }

  function open(trigger: HTMLElement, fromKeyboard: boolean): void {
    close(false);
    makeRoom(trigger);

    const layer = document.createElement('div');
    layer.className = 'blog-avatar-fan';
    layer.setAttribute('popover', 'manual');
    layer.setAttribute('role', 'group');
    layer.setAttribute('aria-label', options.labels.group);

    // The more button first, growing out of the face it covers, then the
    // faces top to bottom.
    const more = item('blog-avatar-fan__more', options.labels.more, null, 0);
    more.innerHTML = options.moreIcon;
    const items = FACE_ANGLES.map((angle, i) => {
      const face = item('blog-avatar-drawn is-empty', options.labels.option(i + 1), angle, i + 1);
      face.setAttribute('aria-disabled', 'true');
      return face;
    });
    layer.append(more, ...items);
    options.host.append(layer);

    fan = { trigger, layer, items, more, turns: 0, deal: 0 };
    layer.showPopover?.();
    place();
    // One layout at the folded position, so the items transition out of it.
    void layer.offsetWidth;
    layer.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');

    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    layer.addEventListener('keydown', onKeydown);
    layer.addEventListener('focusout', onFocusOut);
    layer.addEventListener('click', onItemClick);

    void deal(false);
    if (fromKeyboard) items[0].focus({ preventScroll: true });
  }

  function close(restoreFocus: boolean): void {
    if (!fan) return;
    const { layer, trigger } = fan;
    const hadFocus = layer.contains(document.activeElement);
    fan = null;
    press = null;
    trigger.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', place, { capture: true });
    window.removeEventListener('resize', place);
    window.visualViewport?.removeEventListener('resize', place);
    window.visualViewport?.removeEventListener('scroll', place);
    layer.classList.remove('is-open');
    layer.inert = true;
    setTimeout(() => {
      if (layer.matches(':popover-open')) layer.hidePopover();
      layer.remove();
    }, CLOSE_MS);
    if ((restoreFocus || hadFocus) && trigger.isConnected) trigger.focus({ preventScroll: true });
  }

  /** Fills the five faces, folding the old ones away first on a re-deal. */
  async function deal(swap: boolean): Promise<void> {
    if (!fan) return;
    const current = fan;
    const token = ++current.deal;
    if (swap) {
      current.turns += 1;
      current.more.style.setProperty('--turns', String(current.turns));
      for (const face of current.items) face.classList.add('is-dealing');
    }
    const [seeds] = await Promise.all([options.batch(), swap ? wait(SWAP_MS) : undefined]);
    if (fan !== current || token !== current.deal) return;
    current.items.forEach((face, i) => {
      const seed = seeds[i];
      if (seed === undefined) return;
      options.paint(face, seed);
      face.dataset.seed = String(seed);
      face.removeAttribute('aria-disabled');
      face.classList.remove('is-empty', 'is-dealing');
    });
  }

  function activate(target: HTMLButtonElement): void {
    if (!fan) return;
    if (target === fan.more) {
      void deal(true);
      return;
    }
    const seed = Number(target.dataset.seed);
    if (target.dataset.seed === undefined || !Number.isFinite(seed)) return;
    const { trigger } = fan;
    close(true);
    options.choose(seed, trigger);
  }

  function onItemClick(event: MouseEvent): void {
    const target = (event.target as Element).closest<HTMLButtonElement>('.blog-avatar-fan__item');
    if (target) activate(target);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!fan) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    const order = [...fan.items, fan.more];
    const at = order.indexOf(document.activeElement as HTMLButtonElement);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    let next: number | undefined;
    if (step !== undefined) next = (at + step + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    order[next].focus({ preventScroll: true });
  }

  function onFocusOut(event: FocusEvent): void {
    const to = event.relatedTarget as Node | null;
    if (fan && to && !fan.layer.contains(to) && to !== fan.trigger) close(false);
  }

  document.addEventListener('pointerdown', (event) => {
    const target = event.target as Element;
    const trigger = target.closest?.<HTMLElement>(selector) ?? null;
    if (fan && !trigger && !fan.layer.contains(target)) close(false);
    if (!trigger || event.button !== 0) return;

    const wasOpen = fan?.trigger === trigger;
    if (!wasOpen) open(trigger, false);
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, wasOpen };
    try {
      trigger.setPointerCapture(event.pointerId);
    } catch {
      // Already released: the press still works as a tap.
    }
  });

  document.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.id) return;
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_SLOP) return;
    press.moved = true;
    markHot(itemAt(event.clientX, event.clientY));
  });

  document.addEventListener('pointerup', (event) => {
    if (!press || event.pointerId !== press.id) return;
    const { moved, wasOpen } = press;
    press = null;
    markHot(null);
    const target = moved ? itemAt(event.clientX, event.clientY) : null;
    if (target) activate(target);
    else if (wasOpen && !moved) close(false);
  });

  document.addEventListener('pointercancel', (event) => {
    if (press?.id !== event.pointerId) return;
    press = null;
    markHot(null);
  });

  // Enter and Space arrive as a click with no pointer behind it (detail 0);
  // pointer presses were already handled above.
  document.addEventListener('click', (event) => {
    const trigger = (event.target as Element).closest?.<HTMLElement>(selector);
    if (!trigger || event.detail !== 0) return;
    if (fan?.trigger === trigger) close(true);
    else open(trigger, true);
  });
}
