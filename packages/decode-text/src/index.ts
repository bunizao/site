/**
 * decode-text — dependency-free scramble/decode text reveal.
 *
 * Mechanics:
 *  - The host's text is split into one span per visible grapheme (`.dt-c`)
 *    and one span per whitespace run; `<br>` is kept. Inline color / weight /
 *    style from the original markup is baked onto each cell, because cells are
 *    re-homed into per-line blocks and lose their ancestors.
 *  - Real VISUAL lines are measured (offsetTop grouping) and each line is
 *    rendered as a `white-space: nowrap` block, so a line can change width
 *    without re-wrapping the paragraph.
 *  - Scheduling runs Soulwire's three fronts, but in separated windows: the
 *    shuffled `show` (p^0.5 — cursors flood in early) and `mash` (p^2 —
 *    cursors graduate to boiling scramble) fronts both finish below
 *    `settleStart`, and only then does a strictly left-to-right resolve front
 *    sweep the line at constant speed. Packing the noisy fronts underneath the
 *    resolve front is what keeps the reveal smooth: a cell can never be held
 *    back by a late shuffle slot, so the line crystallises one glyph at a time
 *    instead of snapping in a block at the end.
 *  - There is ONE timeline for the whole text, eased once. Lines are windows
 *    laid out on that shared 0..1 axis, overlapping heavily (`lineSpread`), so
 *    the paragraph reads as a single object condensing. Easing each line
 *    separately instead gives every line its own accelerate/settle cycle, which
 *    is what turns a reveal into a queue of animations running top to bottom.
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
  /** Cursor and scramble appearance order within a line. Final letters always resolve left to right. */
  order?: DecodeOrder;
  /** Show front exponent: cells become visible (cursor) as p^showPower sweeps the queue. Default: 0.5 */
  showPower?: number;
  /** Mash front exponent: cursor graduates to boiling scramble as p^mashPower sweeps. Default: 2 */
  mashPower?: number;
  /**
   * Progress at which the left-to-right resolve front starts its sweep. The
   * show and mash fronts are packed below it, so lower values mean less boiling
   * and a longer, slower crystallisation. Default: 0.52
   */
  settleStart?: number;
  /**
   * Shape of the resolve front across the line. 1 is a constant-speed beam;
   * below 1 opens fast and savours the last glyphs; above 1 hesitates then
   * finishes hard. Default: 0.8
   */
  settleCurve?: number;
  /** Mix the text's own (ASCII) characters into the scramble pool. Default: true */
  scrambleFromText?: boolean;
  /**
   * Wall-clock seconds for the WHOLE reveal, as a rate per character of the
   * full text, clamped to [minDuration, maxDuration]. Lines divide this one
   * timeline between them; they do not each get their own.
   */
  durationPerChar?: number;
  minDuration?: number;
  maxDuration?: number;
  /**
   * Share of the timeline that separates the first line's start from the last
   * line's. `0` starts every line together and finishes them together; `1`
   * plays them back to back. Low values read as one paragraph condensing, high
   * values as a list animating in sequence. Default: 0.3
   */
  lineSpread?: number;
  /** Scramble glyph refresh rate in mutations per second per cell. Default: 18 */
  mutationHz?: number;
  /**
   * Speed curve for the single paragraph timeline. Runs once over the whole
   * text, not once per line. Default accelerates from rest and then coasts.
   * Avoid curves that reach zero speed at `t = 1`: the last line completes
   * there, so it ends up finishing alone well after the others.
   */
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
  /** Window on the eased 0..1 paragraph axis — not seconds. */
  start: number;
  duration: number;
  /** Cells before this index are fully settled — skipped every frame. */
  done: number;
  complete: boolean;
}

/**
 * The paragraph's speed curve: a push, then a coast.
 *
 * Uniform acceleration from rest over the first `RAMP` of the timeline, then
 * the speed it reached bleeding off against `DRAG` — a thrown object rather
 * than a mechanism. Both halves earn their keep.
 *
 * Without the ramp the reveal starts already at speed and there is no opening
 * beat. Without a non-zero speed left at the end it decelerates into a stop,
 * and because the last line completes exactly where the curve flattens, that
 * line is left finishing alone long after the rest: 608ms behind its neighbour
 * under a symmetric ease-out, against 137ms here. An ease-out is the wrong
 * shape for this — nothing is braking, the text simply runs out.
 */
const RAMP = 0.45;
const DRAG = 1.2;
/** Speed carried into the coast, and the progress the ramp covers reaching it. */
const COAST_V = 2 / (2 - RAMP);
const RAMP_P = RAMP / (2 - RAMP);
const coasted = (t: number): number =>
  RAMP_P + (COAST_V * (1 - Math.exp(-DRAG * (t - RAMP)))) / DRAG;
const TRAVEL = coasted(1);

const pushAndCoast = (t: number): number =>
  (t <= RAMP ? (t * t) / (RAMP * (2 - RAMP)) : coasted(t)) / TRAVEL;

const DEFAULTS = {
  charset: '__-—/\\|<>',
  cursorChar: '-',
  layout: 'grow' as DecodeLayout,
  order: 'shuffle' as DecodeOrder,
  showPower: 0.5,
  mashPower: 2,
  settleStart: 0.52,
  settleCurve: 0.8,
  scrambleFromText: true,
  durationPerChar: 0.008,
  minDuration: 0.9,
  maxDuration: 3.2,
  lineSpread: 0.3,
  mutationHz: 18,
  fontTimeout: 400,
  respectReducedMotion: true,
  ease: pushAndCoast,
};

type Resolved = typeof DEFAULTS & DecodeOptions;

/** Largest per-frame clock step, ms. Keeps a backgrounded tab from snapping to done. */
const MAX_FRAME_MS = 64;

/** Share of the pre-settle window the show front owns; the mash front takes the rest. */
const SHOW_WINDOW = 0.65;

/** Progress every cell spends boiling before the resolve front may reach it. */
const MIN_BOIL = 0.06;

/**
 * How far each line's weight is pulled toward the average when laying out the
 * end cascade. Weighting purely by character count gives a short wrapped
 * remnant ("source.") a slice too thin to see — measured at 8ms behind the
 * 70-character line above it, so which one landed first came down to frame
 * jitter. A line is one line to the eye however short it is.
 */
const LINE_EVENNESS = 0.6;

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

const COMBINING_MARK = /\p{Mark}/u;
const EMOJI_MODIFIER = /[\u{1f3fb}-\u{1f3ff}]/u;
const REGIONAL_INDICATOR = /[\u{1f1e6}-\u{1f1ff}]/u;
const ZERO_WIDTH_JOINER = '\u200d';
const GRAPHEME_SEGMENTER =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

const segmentGraphemes = (text: string): string[] => {
  if (GRAPHEME_SEGMENTER) {
    return Array.from(GRAPHEME_SEGMENTER.segment(text), ({ segment }) => segment);
  }

  const segments: string[] = [];
  let regionalRun = 0;
  for (const codePoint of text) {
    const previous = segments.at(-1);
    const isRegional = REGIONAL_INDICATOR.test(codePoint);
    if (
      previous !== undefined &&
      (COMBINING_MARK.test(codePoint) ||
        EMOJI_MODIFIER.test(codePoint) ||
        codePoint === ZERO_WIDTH_JOINER ||
        previous.endsWith(ZERO_WIDTH_JOINER) ||
        (isRegional && regionalRun % 2 === 1))
    ) {
      segments[segments.length - 1] += codePoint;
    } else {
      segments.push(codePoint);
    }
    regionalRun = isRegional ? regionalRun + 1 : 0;
  }
  return segments;
};

/**
 * Replace the host content with one span per visible grapheme and one span
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
        const graphemes = segmentGraphemes(text);
        let i = 0;
        while (i < graphemes.length) {
          if (/\s/u.test(graphemes[i])) {
            while (i < graphemes.length && /\s/u.test(graphemes[i])) i += 1;
            pushCell(parent, ' ', true, node);
          } else {
            pushCell(parent, graphemes[i], false, node);
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
  const lines: Line[] = [];
  for (const cells of trimmed) {
    if (!cells.some((cell) => !cell.space)) continue;

    const block = document.createElement('span');
    block.className = 'dt-line';
    block.style.display = 'block';
    block.style.whiteSpace = 'nowrap';
    for (const cell of cells) block.appendChild(cell.el);
    host.appendChild(block);
    lines.push({ cells, start: 0, duration: 0, done: 0, complete: false });
  }

  return lines;
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
const renderLine = (
  line: Line,
  progress: number,
  now: number,
  pool: readonly string[],
  opts: Resolved
): void => {
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
 * Fold the three fronts into per-cell thresholds.
 *
 * The show and mash fronts keep Soulwire's power shape — a front with exponent
 * y reaches queue fraction q at progress q^(1/y), so showPower < 1 floods
 * cursors in early — but both are scaled into the window below `settleStart`,
 * where `shuffle` can scatter them freely. The resolve front then sweeps left
 * to right at constant speed over the remaining window, one cell at a time.
 *
 * Keeping the two apart is the whole trick. When the shuffled mash threshold
 * was allowed to floor `settleAt` directly, the cell holding the last shuffle
 * slot could not resolve before progress 1, and the monotonic pass dragged
 * every cell behind it to the same frame — so most of a line snapped from
 * scramble to final text in a single frame. Now `mashAt + MIN_BOIL` is capped
 * at `settleStart` by construction, so that floor can never bind and the sweep
 * stays even.
 *
 * Lines are then laid out as overlapping windows on the shared 0..1 axis,
 * weighted by character count. Line k ends at `(1 - spread) + spread · (chars
 * through k) / (chars total)`, which increases with k, so reading order holds
 * by construction — no clamp against the previous line, and no way for a short
 * wrapped remnant to overtake the long line above it. Returns the wall-clock
 * duration of the reveal.
 */
const scheduleLines = (lines: Line[], opts: Resolved): number => {
  const settleStart = Math.min(Math.max(opts.settleStart, MIN_BOIL), 0.95);
  const appearEnd = settleStart * SHOW_WINDOW;
  const mashEnd = Math.max(appearEnd, settleStart - MIN_BOIL);
  const spread = Math.min(Math.max(opts.lineSpread, 0), 0.9);

  const chars = lines.map((line) => Math.max(1, line.cells.length));
  const total = chars.reduce((sum, count) => sum + count, 0);
  const mean = total / lines.length;
  // Blending preserves the sum, so the axis still ends at exactly 1.
  const weights = chars.map((count) => count * (1 - LINE_EVENNESS) + mean * LINE_EVENNESS);
  let cumulative = 0;

  lines.forEach((line, index) => {
    const n = line.cells.length;
    const slots = Array.from({ length: n }, (_, i) => i);
    const appearSlots = opts.order === 'shuffle' ? shuffle(slots.slice()) : slots;
    line.cells.forEach((cell, i) => {
      const q = (appearSlots[i] + 1) / n;
      const reach = Math.pow(n > 1 ? i / (n - 1) : 1, opts.settleCurve);
      cell.appearAt = appearEnd * Math.pow(q, 1 / opts.showPower);
      cell.mashAt = Math.max(cell.appearAt, mashEnd * Math.pow(q, 1 / opts.mashPower));
      cell.settleAt = Math.max(
        cell.mashAt + MIN_BOIL,
        settleStart + (1 - settleStart) * reach
      );
    });
    // Guard the resolve front against custom front options: it only ever moves
    // forward, so text that already reads as finished never gains a letter
    // behind the front.
    for (let i = 1; i < n; i += 1) {
      line.cells[i].settleAt = Math.max(line.cells[i].settleAt, line.cells[i - 1].settleAt);
    }

    line.start = spread * (cumulative / total);
    cumulative += weights[index];
    line.duration = (1 - spread) + spread * (cumulative / total) - line.start;
  });

  return Math.min(opts.maxDuration, Math.max(opts.minDuration, opts.durationPerChar * total));
};

/** The original's `useInput`: mix the text's own ASCII glyphs into the pool. */
const scramblePool = (cells: Cell[], opts: Resolved): string[] => {
  const pool = segmentGraphemes(opts.charset);
  if (!opts.scrambleFromText) return pool;
  const seen = new Set(pool);
  for (const cell of cells) {
    const ch = cell.ch.toLowerCase();
    // ASCII-only: wide glyphs (CJK) in the pool would jitter `grow` layouts.
    if (/^[\x21-\x7e]$/.test(ch) && !seen.has(ch)) {
      pool.push(ch);
      seen.add(ch);
    }
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

    const duration = scheduleLines(lines, opts);
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

      // One curve for the whole paragraph. Lines read their windows off the
      // eased axis, so the tempo — the held opening and the acceleration after
      // it — belongs to the text as a whole and every line shares it.
      const p = duration > 0 && clock < duration ? opts.ease(clock / duration) : 1;

      for (const line of lines) {
        if (line.complete) continue;
        const t = (p - line.start) / line.duration;
        if (t < 0) continue;
        if (t >= 1) {
          renderLine(line, 1, now, pool, opts);
          line.complete = true;
          remaining -= 1;
          continue;
        }
        renderLine(line, t, now, pool, opts);
      }

      if (remaining > 0) raf = requestAnimationFrame(tick);
      else complete();
    };

    watchdog = window.setTimeout(forceFinish, duration * 1000 + 1500);
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
