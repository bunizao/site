/**
 * decode-text — dependency-free scramble/decode text reveal.
 *
 * Mechanics:
 *  - The host's text is split into one span per visible character (`.dt-c`)
 *    and one span per whitespace run; `<br>` is kept. Inline color / weight /
 *    style from the original markup is baked onto each cell, because cells are
 *    re-homed into per-line blocks and lose their ancestors.
 *  - Real VISUAL lines are measured (offsetTop grouping) and each line is
 *    rendered as a `white-space: nowrap` block, so a line can change width
 *    without re-wrapping the paragraph.
 *  - Scheduling follows Soulwire's original three power fronts sweeping a
 *    (usually shuffled) queue: `show` (p^0.5 — cursors flood in early),
 *    `mash` (p^2 — cursors graduate to boiling scramble), and `done`
 *    (p^15 — almost nothing resolves until the end, then it crystallises in
 *    a cascade). Each front is folded into per-cell thresholds up front.
 *  - Two layout modes:
 *      `grow`   — unshown characters collapse to zero width and the line
 *                 condenses in. Scramble glyphs must match the real glyph
 *                 width, so use a monospace font.
 *      `static` — every cell is locked to its final glyph width up front
 *                 (inline-block), so glyphs pop in place. Works in any font.
 *  - The engine is a single requestAnimationFrame loop with a capped-delta
 *    clock: scramble mutation is scheduled in wall time (frame-rate
 *    independent) and a backgrounded tab resumes smoothly instead of snapping.
 *  - While animating, the root gets `contain: layout paint` and a locked
 *    min-height so per-frame churn never reflows the page below, and a
 *    visually-hidden copy of the original text keeps screen readers ahead of
 *    the animation.
 */

export type DecodeLayout = 'grow' | 'static';
export type DecodeOrder = 'ltr' | 'shuffle';

export interface DecodeOptions {
  /** Scramble glyph pool. Default: `__-—/\\|<>` */
  charset?: string;
  /** Glyph a cell shows between the show and mash fronts. Default: `-` */
  cursorChar?: string;
  /** `grow` (condensing line, monospace) or `static` (pop in place, any font). Default: `grow` */
  layout?: DecodeLayout;
  /** Appearance order within a line. Default: `shuffle` (the Soulwire original) */
  order?: DecodeOrder;
  /** Show front exponent: cells become visible (cursor) as p^showPower sweeps the queue. Default: 0.5 */
  showPower?: number;
  /** Mash front exponent: cursor graduates to boiling scramble as p^mashPower sweeps. Default: 2 */
  mashPower?: number;
  /** Done front exponent: scramble resolves as p^donePower sweeps — high values hold everything until an end cascade. Default: 15 */
  donePower?: number;
  /** Mix the text's own (ASCII) characters into the scramble pool. Default: true */
  scrambleFromText?: boolean;
  /** Seconds of line duration per character, clamped to [minLineDuration, maxLineDuration]. */
  durationPerChar?: number;
  minLineDuration?: number;
  maxLineDuration?: number;
  /** Next line starts at `lineStagger * (sum of previous line durations)`. Default: 0.16 */
  lineStagger?: number;
  /** Scramble glyph refresh rate in mutations per second per cell. Default: 18 */
  mutationHz?: number;
  /** Timeline easing. Default: easeInOutQuint (the Soulwire original) */
  ease?: (t: number) => number;
  /** Wait for `document.fonts.ready` up to this many ms before measuring. Default: 400 */
  fontTimeout?: number;
  /** Skip the animation entirely under prefers-reduced-motion. Default: true */
  respectReducedMotion?: boolean;
  onComplete?: () => void;
}

export interface DecodeController {
  /** Begin the reveal. Safe to call more than once; later calls are ignored. */
  start(): void;
  /** Stop immediately and restore the original markup. */
  cancel(): void;
  /** True once the host has been measured and blanked, ready to start. */
  readonly prepared: boolean;
  /** Resolves when the reveal finishes or is cancelled. */
  finished: Promise<void>;
}

interface Cell {
  el: HTMLElement;
  ch: string;
  space: boolean;
  temp: string;
  /** Progress thresholds where each front reaches this cell: show ≤ mash ≤ done. */
  appearAt: number;
  mashAt: number;
  settleAt: number;
  nextMutation: number;
}

interface Line {
  cells: Cell[];
  start: number;
  duration: number;
  /** Cells before this index are fully settled — skipped every frame. */
  done: number;
  complete: boolean;
}

const DEFAULTS = {
  charset: '__-—/\\|<>',
  cursorChar: '-',
  layout: 'grow' as DecodeLayout,
  order: 'shuffle' as DecodeOrder,
  showPower: 0.5,
  mashPower: 2,
  donePower: 15,
  scrambleFromText: true,
  durationPerChar: 0.024,
  minLineDuration: 0.5,
  maxLineDuration: 1.8,
  lineStagger: 0.16,
  mutationHz: 18,
  fontTimeout: 400,
  respectReducedMotion: true,
  ease: (t: number): number =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
};

type Resolved = typeof DEFAULTS & DecodeOptions;

/** Largest per-frame clock step, ms. Keeps a backgrounded tab from snapping to done. */
const MAX_FRAME_MS = 64;

const SR_ONLY_STYLE =
  'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const shuffle = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

/**
 * Replace the host content with one span per visible character and one span
 * per whitespace run, keeping <br>. Color / weight / style that differ from
 * the host are baked onto each cell so they survive re-homing into line blocks.
 */
const buildCells = (host: HTMLElement): Cell[] => {
  const cells: Cell[] = [];
  const frag = document.createDocumentFragment();
  const base = getComputedStyle(host);
  const styleCache = new Map<Element, { color: string; weight: string; fontStyle: string } | null>();

  const bakedStyle = (el: Element) => {
    let baked = styleCache.get(el);
    if (baked === undefined) {
      const cs = getComputedStyle(el);
      baked =
        cs.color !== base.color || cs.fontWeight !== base.fontWeight || cs.fontStyle !== base.fontStyle
          ? { color: cs.color, weight: cs.fontWeight, fontStyle: cs.fontStyle }
          : null;
      styleCache.set(el, baked);
    }
    return baked;
  };

  const pushCell = (parent: Node, ch: string, space: boolean, source: Element): void => {
    const span = document.createElement('span');
    span.className = 'dt-c';
    span.textContent = space ? ' ' : ch;
    if (!space) {
      const baked = bakedStyle(source);
      if (baked) {
        span.style.color = baked.color;
        span.style.fontWeight = baked.weight;
        span.style.fontStyle = baked.fontStyle;
      }
    }
    cells.push({ el: span, ch, space, temp: '', appearAt: 0, mashAt: 0, settleAt: 0, nextMutation: 0 });
    parent.appendChild(span);
  };

  const walk = (node: Element, parent: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        let i = 0;
        while (i < text.length) {
          if (/\s/.test(text[i])) {
            while (i < text.length && /\s/.test(text[i])) i += 1;
            pushCell(parent, ' ', true, node);
          } else {
            pushCell(parent, text[i], false, node);
            i += 1;
          }
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.tagName === 'BR') parent.appendChild(document.createElement('br'));
        else walk(el, parent);
      }
    }
  };

  walk(host, frag);
  host.replaceChildren(frag);
  return cells;
};

/**
 * Group cells into visual lines by measured offsetTop, then re-home each line
 * into its own nowrap block so a growing line never re-wraps. Leading and
 * trailing spaces are dropped. In `static` layout every cell is additionally
 * locked to its measured glyph width so scramble glyphs cannot shift anything.
 */
const layoutLines = (host: HTMLElement, cells: Cell[], layout: DecodeLayout): Line[] => {
  const groups: Cell[][] = [];
  let top = Number.NaN;
  for (const cell of cells) {
    const cellTop = Math.round(cell.el.offsetTop);
    if (cellTop !== top) {
      top = cellTop;
      groups.push([]);
    }
    groups[groups.length - 1].push(cell);
  }

  if (layout === 'static') {
    // Read pass first (one layout), write pass second — no thrash.
    const widths = cells.map((cell) => cell.el.getBoundingClientRect().width);
    cells.forEach((cell, i) => {
      cell.el.style.display = 'inline-block';
      cell.el.style.width = `${widths[i]}px`;
      cell.el.style.textAlign = 'center';
    });
  }

  const trimmed = groups.map((line) => {
    let start = 0;
    let end = line.length;
    while (start < end && line[start].space) start += 1;
    while (end > start && line[end - 1].space) end -= 1;
    return line.slice(start, end);
  });

  host.replaceChildren();
  for (const line of trimmed) {
    const block = document.createElement('span');
    block.className = 'dt-line';
    block.style.display = 'block';
    block.style.whiteSpace = 'nowrap';
    for (const cell of line) block.appendChild(cell.el);
    host.appendChild(block);
  }

  return trimmed
    .filter((line) => line.some((cell) => !cell.space))
    .map((line) => ({ cells: line, start: 0, duration: 0, done: 0, complete: false }));
};

type CellState = '' | 'cursor' | 'scramble';

const setCell = (cell: Cell, state: CellState, text: string): void => {
  if ((cell.el.dataset.state ?? '') !== state) {
    if (state) cell.el.dataset.state = state;
    else delete cell.el.dataset.state;
    // Default look without a stylesheet; consumers can override via [data-state].
    cell.el.style.opacity = state === 'cursor' ? '0.3' : state === 'scramble' ? '0.55' : '';
  }
  if (cell.el.textContent !== text) cell.el.textContent = text;
};

const hiddenText = (cell: Cell, layout: DecodeLayout): string =>
  cell.space ? ' ' : layout === 'static' ? ' ' : '';

/**
 * One frame of one line. Settled cells accumulate at `line.done` and are never
 * revisited; in `ltr` order the walk also stops at the first not-yet-appeared
 * cell (the show front is monotonic there), so each frame touches only the
 * active window.
 */
const renderLine = (line: Line, progress: number, now: number, pool: string, opts: Resolved): void => {
  const { cells } = line;
  for (let i = line.done; i < cells.length; i += 1) {
    const cell = cells[i];
    if (progress >= cell.settleAt) {
      setCell(cell, '', cell.space ? ' ' : cell.ch);
      if (i === line.done) line.done += 1;
    } else if (progress < cell.appearAt) {
      if (opts.order === 'ltr' && !cell.space) return;
      setCell(cell, '', hiddenText(cell, opts.layout));
    } else if (cell.space) {
      setCell(cell, '', ' ');
    } else if (progress < cell.mashAt) {
      setCell(cell, 'cursor', opts.cursorChar);
    } else {
      if (!cell.temp || now >= cell.nextMutation) {
        cell.temp = pool[Math.floor(Math.random() * pool.length)] ?? '_';
        cell.nextMutation = now + (1000 / opts.mutationHz) * (0.5 + Math.random());
      }
      setCell(cell, 'scramble', cell.temp);
    }
  }
};

/**
 * Fold the three power fronts into per-cell thresholds. A front with exponent
 * y reaches queue fraction q at progress q^(1/y): showPower < 1 floods
 * cursors in early, donePower >> 1 holds resolution back until an end
 * cascade. In `shuffle` order one shuffled queue drives all three fronts (the
 * Soulwire original); in `ltr` the show/mash fronts sweep left to right while
 * resolution stays shuffled, so the boil still settles at scattered positions.
 */
const scheduleLines = (lines: Line[], opts: Resolved): void => {
  let cumulative = 0;
  for (const line of lines) {
    const n = line.cells.length;
    const slots = Array.from({ length: n }, (_, i) => i);
    const appearSlots = opts.order === 'shuffle' ? shuffle(slots.slice()) : slots;
    const settleSlots = opts.order === 'shuffle' ? appearSlots : shuffle(slots.slice());
    line.cells.forEach((cell, i) => {
      const qAppear = (appearSlots[i] + 1) / n;
      const qSettle = (settleSlots[i] + 1) / n;
      cell.appearAt = Math.pow(qAppear, 1 / opts.showPower);
      cell.mashAt = Math.max(cell.appearAt, Math.pow(qAppear, 1 / opts.mashPower));
      cell.settleAt = Math.max(cell.mashAt, Math.pow(qSettle, 1 / opts.donePower));
    });
    line.duration = Math.min(
      opts.maxLineDuration,
      Math.max(opts.minLineDuration, opts.durationPerChar * n)
    );
    line.start = opts.lineStagger * cumulative;
    cumulative += line.duration;
  }
};

/** The original's `useInput`: mix the text's own ASCII glyphs into the pool. */
const scramblePool = (cells: Cell[], opts: Resolved): string => {
  if (!opts.scrambleFromText) return opts.charset;
  let pool = opts.charset;
  for (const cell of cells) {
    const ch = cell.ch.toLowerCase();
    // ASCII-only: wide glyphs (CJK) in the pool would jitter `grow` layouts.
    if (/[\x21-\x7e]/.test(ch) && !pool.includes(ch)) pool += ch;
  }
  return pool;
};

/**
 * Measure and blank `root`, returning a controller whose `start()` plays the
 * reveal. Between prepare and start every character slot is empty (spaces keep
 * their gap in `grow`; every cell keeps its width in `static`), so the caller
 * can un-hide the element without flashing the full text.
 *
 * Under prefers-reduced-motion (unless disabled) the DOM is left untouched and
 * `start()` is a no-op.
 */
export const prepareDecode = async (
  root: HTMLElement,
  options: DecodeOptions = {}
): Promise<DecodeController> => {
  const opts: Resolved = { ...DEFAULTS, ...options };
  const original = root.innerHTML;

  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const inert: DecodeController = {
    start: () => resolveFinished(),
    cancel: () => resolveFinished(),
    prepared: false,
    finished,
  };

  if (opts.respectReducedMotion && prefersReducedMotion()) return inert;

  // Measure against the final font when it is ready, but never block on it:
  // past `fontTimeout` the fallback font is the real footprint for this load.
  await Promise.race([
    document.fonts?.ready,
    new Promise((resolve) => window.setTimeout(resolve, opts.fontTimeout)),
  ]).catch(() => {});

  // Lock the footprint so text -> cells -> text never shifts the page.
  root.style.minHeight = `${root.getBoundingClientRect().height}px`;

  const host = root.querySelector<HTMLElement>('p') ?? root;
  const srText = host.textContent ?? '';
  const cells = buildCells(host);
  if (cells.length === 0) {
    root.style.removeProperty('min-height');
    return inert;
  }

  const lines = layoutLines(host, cells, opts.layout);
  for (const line of lines) {
    for (const cell of line.cells) setCell(cell, '', hiddenText(cell, opts.layout));
  }

  // Screen readers get the full text immediately; the animation is decoration.
  const sr = document.createElement('span');
  sr.setAttribute('style', SR_ONLY_STYLE);
  sr.textContent = srText;
  root.prepend(sr);
  host.setAttribute('aria-hidden', 'true');

  let started = false;
  let raf = 0;
  let done = false;

  const finish = (): void => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(watchdog);
    if (onHidden) document.removeEventListener('visibilitychange', onHidden);
    root.classList.remove('dt-animating');
    root.style.removeProperty('contain');
    root.style.removeProperty('min-height');
    host.removeAttribute('aria-hidden');
    sr.remove();
    resolveFinished();
  };

  let watchdog = 0;
  let onHidden: (() => void) | null = null;

  const start = (): void => {
    if (started || done) return;
    started = true;

    scheduleLines(lines, opts);
    const pool = scramblePool(cells, opts);
    root.classList.add('dt-animating');
    // Isolate per-frame churn so it cannot reflow content below the root.
    root.style.contain = 'layout paint';

    let clock = 0;
    let last = performance.now();
    let remaining = lines.length;

    const complete = (): void => {
      finish();
      opts.onComplete?.();
    };

    // Jump straight to the resolved text. Used when the tab is hidden
    // mid-reveal (rAF pauses; the text must not stay scrambled) and by the
    // wall-clock watchdog in case rAF stalls for any other reason.
    const forceFinish = (): void => {
      if (done) return;
      for (const line of lines) {
        if (!line.complete) renderLine(line, 1, performance.now(), pool, opts);
      }
      complete();
    };

    const tick = (now: number): void => {
      clock += Math.min(now - last, MAX_FRAME_MS) / 1000;
      last = now;

      for (const line of lines) {
        if (line.complete) continue;
        const t = (clock - line.start) / line.duration;
        if (t < 0) continue;
        if (t >= 1) {
          renderLine(line, 1, now, pool, opts);
          line.complete = true;
          remaining -= 1;
          continue;
        }
        renderLine(line, opts.ease(t), now, pool, opts);
      }

      if (remaining > 0) raf = requestAnimationFrame(tick);
      else complete();
    };

    const totalEnd = lines.reduce((end, line) => Math.max(end, line.start + line.duration), 0);
    watchdog = window.setTimeout(forceFinish, totalEnd * 1000 + 1500);
    onHidden = () => {
      if (document.visibilityState === 'hidden') forceFinish();
    };
    document.addEventListener('visibilitychange', onHidden);

    raf = requestAnimationFrame(tick);
  };

  const cancel = (): void => {
    if (done) return;
    finish();
    root.innerHTML = original;
  };

  return { start, cancel, prepared: true, finished };
};

/** Prepare and start immediately. */
export const decodeText = async (
  root: HTMLElement,
  options: DecodeOptions = {}
): Promise<DecodeController> => {
  const controller = await prepareDecode(root, options);
  controller.start();
  return controller;
};
