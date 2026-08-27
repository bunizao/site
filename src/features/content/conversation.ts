// Renders a ```conversation fenced block into a chat thread.
//
// Pure source -> HTML. No client JS, no DOM, no imports: the same function runs
// in the Ghost prose path, the markdown path, and unit tests. Everything the
// browser needs is in the markup plus conversation.css.
//
// Syntax reference: https://buxx.me/docs/writing/conversation
//
//   @conversation avatars=off names=off tints=off   whole-thread visibility
//   @ada [Ada Lovelace] accent=#4E7A5E  cast line: override a default
//   @tutu [图图] avatar=🐈           key is one token, [name] is prose
//
//   you: how wide should a bubble be?    message; you/me/你/我 = the own side
//   ada: 30em.
//   ada: A CJK glyph is 1em and a Latin
//     glyph about half that.             indented -> soft wrap, same bubble
//   --- later                            divider, with or without a label
//
// Speakers auto-register on first use, labelled exactly as first written, and
// the first voice takes the own side when no own-side key appears, so a
// two-party exchange needs no cast lines at all. Cast lines exist to override
// those defaults, never to satisfy the parser.

export const CONVERSATION_LANGUAGE = 'conversation';

export interface ConversationOptions {
  avatars: boolean;
  names: boolean;
  /** The accent wash on the receiving side. Off leaves every bubble neutral. */
  tints: boolean;
}

export type ConversationOption = keyof ConversationOptions;

export function isConversationLanguage(lang: string): boolean {
  return lang.toLowerCase() === CONVERSATION_LANGUAGE;
}

/** A declared or auto-registered participant. */
interface Speaker {
  key: string;
  label: string;
  avatar: string;
  /** Renders on the trailing side, filled, with no visible name or avatar. */
  me: boolean;
  /** Author-supplied hex. Empty means the monochrome default. */
  accent: string;
}

interface Bubble {
  text: string;
}

type Item =
  | { type: 'group'; speaker: Speaker; bubbles: Bubble[] }
  | { type: 'note'; text: string };

/**
 * A key is ONE token: no whitespace, no colon. A cast line and a message head
 * take the same one, which is the only reason `@ada` and `ada:` cannot drift
 * apart. A name that will not fit in a token is not a key — it is a `[name]`.
 */
const DECLARATION = /^@([^\s:：]+)(?:\s+(.*))?$/u;
const MESSAGE = /^([^\s:：]+)[:：]\s*(.*)$/u;

/** Typst's content block: a name is prose, so it is delimited, not quoted. */
const LABEL_BLOCK = /^\[([^\]]+)\]/u;
/** A value is one token too. Anything that wants a space is a `[name]`. */
const ATTRIBUTE = /^([A-Za-z][A-Za-z0-9_]*)=([^\s]+)$/u;
const CONVERSATION_HEADER = '@conversation';
const FENCED_SOURCE = /^(\s*```conversation[^\S\r\n]*\r?\n)([\s\S]*?)(\r?\n```[^\S\r\n]*\s*)$/iu;
const DEFAULT_OPTIONS: ConversationOptions = { avatars: true, names: true, tints: true };
const OPTION_NAMES = Object.keys(DEFAULT_OPTIONS) as ConversationOption[];

/**
 * The own side of a thread draws no name and no avatar — a reader does not need
 * reminding what they look like — so it needs no identity, only a key to group
 * its runs under. These are those keys.
 *
 * `me:` and `you:` are the two framings a thread gets written in: the author
 * speaking, or the reader cast as the one asking. 我 and 你 are the same two,
 * reachable without leaving a Chinese keyboard, exactly as `：` is.
 *
 * Naming the side at the point of use is the whole trick. The alternative was a
 * bare `me` on a cast line, which is a token that renders nothing, exists only
 * to move a bubble, and reads as an identity next to a key that is also one.
 */
const OWN_SIDE = new Set(['me', 'you', '我', '你']);

/**
 * A head that is a URL scheme would turn a bare link into a phantom speaker,
 * Markdown punctuation means the line is prose rather than an attribution, and
 * a leading `@` means it is a cast line the grammar rejected.
 */
const MARKDOWN_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\p{P}]/u;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isValidKey(head: string): boolean {
  return (
    Array.from(head).length <= 24 &&
    Array.from(head).length > 0 &&
    !/[\s:：]/u.test(head) &&
    !head.startsWith('@') &&
    head.toLowerCase() !== CONVERSATION_LANGUAGE &&
    !/^(https?|mailto|tel|ftp)$/i.test(head) &&
    !MARKDOWN_PUNCTUATION.test(head)
  );
}

function splitConversationSource(source: string): {
  body: string;
  wrap: (body: string) => string;
} {
  const fenced = FENCED_SOURCE.exec(source);
  if (!fenced) return { body: source, wrap: (body) => body };

  return {
    body: fenced[2],
    wrap: (body) => fenced[1] + body + fenced[3],
  };
}

function parseConversationOptions(line: string): ConversationOptions | null {
  const matched = /^@conversation\s+(.+)$/u.exec(line);
  if (!matched) return null;

  const options = { ...DEFAULT_OPTIONS };
  const seen = new Set<ConversationOption>();
  for (const token of matched[1].split(/\s+/u)) {
    const attribute = ATTRIBUTE.exec(token);
    if (!attribute) return null;

    const name = attribute[1] as ConversationOption;
    const value = attribute[2];
    if (!OPTION_NAMES.includes(name) || (value !== 'on' && value !== 'off')) {
      return null;
    }
    if (seen.has(name)) return null;
    seen.add(name);
    options[name] = value === 'on';
  }

  return options;
}

export function setConversationOption(
  source: string,
  name: ConversationOption,
  enabled: boolean,
): string {
  const framed = splitConversationSource(source);
  const lines = framed.body.split('\n');
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  const firstLine = firstContent >= 0 ? lines[firstContent].trim() : '';
  const options = firstLine.startsWith(CONVERSATION_HEADER)
    ? parseConversationOptions(firstLine) ?? { ...DEFAULT_OPTIONS }
    : { ...DEFAULT_OPTIONS };

  options[name] = enabled;
  const header = OPTION_NAMES.reduce(
    (line, option) => `${line} ${option}=${options[option] ? 'on' : 'off'}`,
    CONVERSATION_HEADER,
  );
  if (firstLine.startsWith(CONVERSATION_HEADER)) {
    lines[firstContent] = header;
  } else if (firstContent >= 0) {
    lines.splice(firstContent, 0, header);
  } else {
    lines.splice(0, lines.length, header);
  }

  return framed.wrap(lines.join('\n'));
}

interface Declaration {
  key: string;
  label?: string;
  accent?: string;
  avatar?: string;
}

/**
 * A cast line is a key, then nothing but one `[name]` and `name=value` pairs.
 * A stray token, or an attribute the grammar has no place for, makes the line
 * not a cast line at all: it falls through and renders as written, where the
 * author can see it. The alternative is applying half of it and dropping the
 * rest in silence, which is how `@Ada Lovelace` used to declare `ada`.
 */
function parseDeclaration(line: string): Declaration | null {
  const matched = DECLARATION.exec(line);
  if (!matched) return null;

  if (!isValidKey(matched[1])) return null;

  const declaration: Declaration = { key: matched[1] };
  let rest = matched[2]?.trim() ?? '';

  if (rest.startsWith('[')) {
    const block = LABEL_BLOCK.exec(rest);
    if (!block) return null;
    declaration.label = block[1].trim();
    rest = rest.slice(block[0].length);
    if (rest && !/^\s/u.test(rest)) return null;
    rest = rest.trim();
  }

  if (!rest) return declaration;

  const attributes = new Set<string>();
  for (const token of rest.split(/\s+/u)) {
    const attribute = ATTRIBUTE.exec(token);
    if (!attribute || /[\[\]"']/.test(attribute[2])) return null;
    const [, name, value] = attribute;
    if (attributes.has(name)) return null;
    attributes.add(name);
    if (name === 'accent') {
      if (!HEX.test(value)) return null;
      declaration.accent = value;
    } else if (name === 'avatar') declaration.avatar = value;
    else return null;
  }

  return declaration;
}

const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;

/**
 * An indented line is a soft wrap, exactly as in Markdown: it continues the
 * sentence rather than starting a new paragraph. Authors wrap long messages in
 * source for readability and do not expect a visible break where they hit
 * return.
 *
 * Latin text needs a space at the seam, because the space is what separates
 * two words. CJK carries none between characters, so when either side of the
 * seam is CJK the join is tight: the gap a mixed seam wants is spacing, not a
 * character, and `text-autospace` draws it at render time
 * (conversation.css). The rule never adds a character the source lacks.
 */
function joinWrapped(head: string, tail: string): string {
  if (!head) return tail;
  if (!tail) return head;
  return CJK.test(head[head.length - 1]) || CJK.test(tail[0]) ? head + tail : head + ' ' + tail;
}

export function parseConversation(source: string): {
  cast: Map<string, Speaker>;
  items: Item[];
  options: ConversationOptions;
} {
  const framed = splitConversationSource(source);
  const lines = framed.body.split('\n');
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  const firstLine = firstContent >= 0 ? lines[firstContent].trim() : '';
  const parsedOptions = firstLine.startsWith(CONVERSATION_HEADER)
    ? parseConversationOptions(firstLine)
    : null;
  const options = parsedOptions ?? { ...DEFAULT_OPTIONS };
  if (parsedOptions) lines.splice(firstContent, 1);

  const cast = new Map<string, Speaker>();
  const items: Item[] = [];
  let group: Extract<Item, { type: 'group' }> | null = null;
  let bubble: Bubble | null = null;
  let firstVoice: Speaker | null = null;

  const speaker = (name: string): Speaker => {
    const key = name.toLowerCase();
    let found = cast.get(key);
    if (!found) {
      found = { key, label: name, avatar: '', me: false, accent: '' };
      cast.set(key, found);
    }
    return found;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const indented = /^\s+\S/.test(raw);

    // A blank line ends the current bubble, so the next message from the same
    // speaker starts a new one instead of appending a paragraph.
    if (!line) {
      bubble = null;
      continue;
    }

    const declaration = !indented ? parseDeclaration(line) : null;
    if (declaration) {
      const target = speaker(declaration.key);
      if (declaration.label !== undefined) target.label = declaration.label;
      if (declaration.accent !== undefined) target.accent = declaration.accent;
      if (declaration.avatar !== undefined) target.avatar = declaration.avatar;
      continue;
    }

    if (!indented && line.startsWith('---')) {
      items.push({ type: 'note', text: line.slice(3).trim() });
      group = null;
      bubble = null;
      continue;
    }

    const message = !indented ? MESSAGE.exec(line) : null;
    const head = message?.[1].trim();
    if (message && head && isValidKey(head)) {
      const target = speaker(head);
      target.me = OWN_SIDE.has(target.key);
      if (!firstVoice) firstVoice = target;
      // Consecutive messages from one speaker collapse into a single run, which
      // is what lets a stack of five bubbles carry exactly one name.
      if (!group || group.speaker !== target) {
        group = { type: 'group', speaker: target, bubbles: [] };
        items.push(group);
      }
      bubble = { text: message[2] };
      group.bubbles.push(bubble);
      continue;
    }

    if (indented && bubble) {
      bubble.text = joinWrapped(bubble.text, line);
      continue;
    }
    group = null;
    bubble = null;
    items.push({ type: 'note', text: line });
  }

  // With no own-side key on stage, the first voice takes that side. Two named
  // strangers still lay out as a conversation rather than as two columns.
  if (![...cast.values()].some((s) => s.me) && firstVoice) firstVoice.me = true;

  return { cast, items, options };
}

/* --- escaping and inline markup ------------------------------------------ */

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] as string
  );
}

/**
 * A deliberately small subset: code, links, bold, italic. A conversation is
 * dialogue, not an article — headings and lists inside a chat bubble would be
 * a sign the content belongs in prose instead.
 */
function renderInline(value: string): string {
  let html = escapeHtml(value);
  const codeSpans: string[] = [];
  const links: string[] = [];

  html = html.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `\u0001C${codeSpans.length}\u0001`;
    codeSpans.push('<code>' + code + '</code>');
    return token;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, href: string) => {
    const safeHref = linkHref(href);
    if (!safeHref) return match;
    const token = `\u0000${links.length}\u0000`;
    links.push('<a href="' + safeHref + '" rel="noopener">' + text + '</a>');
    return token;
  });

  return html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\u0000(\d+)\u0000/g, (_match, index: string) => links[Number(index)] ?? '')
    .replace(/\u0001C(\d+)\u0001/g, (_match, index: string) => codeSpans[Number(index)] ?? '');
}

function linkHref(value: string): string | null {
  const decoded = value.replace(/&amp;/g, '&');
  if (/^https?:\/\//i.test(decoded)) {
    try {
      const url = new URL(decoded);
      if (url.username || url.password) return null;
      return value;
    } catch {
      return null;
    }
  }

  if (/^\/(?![\\/])/u.test(decoded) || /^#[^\s]/u.test(decoded)) {
    return value;
  }

  return null;
}

/* --- contrast -------------------------------------------------------------
   Only runs when an author opts into a custom accent. The default is
   monochrome and derives from --foreground in CSS, where it is AA by
   construction in both themes and needs no maths at all. */

function toRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(color: [number, number, number]): number {
  const [r, g, b] = color
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function toHex(color: number[]): string {
  return '#' + color.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Black or white, whichever reads better on top of a filled bubble. */
export function textOnAccent(accent: string): string {
  const fill = toRgb(accent);
  return contrastRatio(toRgb('#FFFFFF'), fill) >= contrastRatio(toRgb('#0A0A0A'), fill)
    ? '#FFFFFF'
    : '#0A0A0A';
}

/**
 * A hex picked to look good as a bubble FILL routinely lands near 4:1 when
 * reused as name text. Walk it toward the far end of the background in 4% steps
 * until it clears AA, keeping as much of the chosen hue as the ratio allows.
 */
export function nameOnBackground(accent: string, background: string): string {
  const floor = toRgb(background);
  const start = toRgb(accent);
  const target = luminance(floor) > 0.4 ? 0 : 255;
  for (let t = 0; t < 1; t += 0.04) {
    const walked = start.map((v) => v + (target - v) * t);
    if (contrastRatio(walked as [number, number, number], floor) >= 4.5) return toHex(walked);
  }
  return target ? '#FFFFFF' : '#000000';
}

/**
 * --conv-neutral composited over each theme's page background: the floor the
 * tint is built beside. Measured from the rendered component, not assumed.
 */
const BUBBLE_BACKGROUND = { light: '#ECECEC', dark: '#232323' };

/**
 * The name sits beside the bubble rather than inside it, so this is the floor
 * it is read against. Both themes are further from a mid-dark accent than the
 * bubble was, which means the name walks LESS and keeps more of the hex the
 * author actually chose.
 */
const PAGE_BACKGROUND = { light: '#FFFFFF', dark: '#0A0A0A' };

/* --- tint -----------------------------------------------------------------
   The receiving side's bubble carries the speaker's accent as a tint, which is
   the only surface an accent has left on a thread running names=off
   avatars=off.

   Mixing the accent INTO the bubble colour was the obvious way to get one, and
   it is wrong in light mode: an accent picked as a fill is a mid-dark colour,
   so mixing drags the bubble's lightness down toward it and lands on a heavy,
   dirty pastel. It is also uneven across hues — the same 20% of a violet reads
   twice as loud as 20% of a sage, because sRGB mixing says nothing about how
   light a colour looks.

   So the tint is not a mix. It keeps the accent's HUE, pins lightness beside
   the bubble's own, and caps chroma at a fixed ceiling. In OKLCH those three
   are separable and lightness matches perception, which is the whole reason to
   pay for the conversion: every speaker's tint then sits at the same weight,
   whatever hue the author picked. */

const LINEAR_LMS = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];

const LMS_OKLAB = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];

const OKLAB_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];

const LMS_RGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

const apply = (matrix: number[][], v: number[]): number[] =>
  matrix.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);

const toLinear = (v: number): number =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

const fromLinear = (v: number): number =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

interface Oklch {
  lightness: number;
  chroma: number;
  hue: number;
}

function toOklch(hex: string): Oklch {
  const linear = toRgb(hex).map((v) => toLinear(v / 255));
  const [lightness, a, b] = apply(LMS_OKLAB, apply(LINEAR_LMS, linear).map(Math.cbrt));
  return { lightness, chroma: Math.hypot(a, b), hue: Math.atan2(b, a) };
}

/**
 * Chroma is the only one of the three that can leave sRGB, and it leaves it
 * gradually, so walking it down is enough — no gamut solver, and the tints this
 * is asked for are pale enough that the loop almost never runs twice.
 */
function fromOklch({ lightness, chroma, hue }: Oklch): string {
  for (let c = chroma; c > 0; c -= 0.002) {
    const lms = apply(OKLAB_LMS, [lightness, Math.cos(hue) * c, Math.sin(hue) * c]);
    const rgb = apply(LMS_RGB, lms.map((v) => v ** 3)).map(fromLinear);
    if (rgb.every((v) => v >= 0 && v <= 1)) return toHex(rgb.map((v) => v * 255));
  }
  return toHex(apply(LMS_RGB, apply(OKLAB_LMS, [lightness, 0, 0]).map((v) => v ** 3))
    .map((v) => fromLinear(v) * 255));
}

/**
 * How far the tint sits from the bubble it replaces, and how much colour it is
 * allowed. Dark themes take both a little heavier: a tint has to climb away
 * from a dark floor to register at all, and the same chroma reads quieter
 * against black than against white.
 *
 * The ceiling is what keeps a thread even. Capping rather than scaling means a
 * violet at C=0.17 and a sage at C=0.06 both arrive at the same weight, so no
 * speaker shouts louder than another for reasons the author never chose.
 */
const TINT = {
  light: { shift: -0.03, ceiling: 0.03 },
  dark: { shift: 0.055, ceiling: 0.034 },
};

/** The receiving side's bubble: the accent's hue at the bubble's own weight. */
export function tintedBubble(accent: string, background: string): string {
  const floor = toOklch(background);
  const hue = toOklch(accent);
  const { shift, ceiling } = floor.lightness > 0.5 ? TINT.light : TINT.dark;
  return fromOklch({
    lightness: floor.lightness + shift,
    chroma: Math.min(hue.chroma, ceiling),
    hue: hue.hue,
  });
}

/* --- avatars -------------------------------------------------------------- */

function initials(label: string): string {
  if (/[一-鿿]/.test(label)) return label.slice(-1);
  return label
    .split(/[\s._-]+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * Four forms, in the order an author reaches for them:
 *   avatar=https://… | /local.png | data:image/svg+xml,…   -> <img>
 *   avatar=#sprite-id                                      -> sprite <use>
 *   avatar=🐈                                              -> the glyph
 *   (omitted)                                              -> initials
 *
 * Raw inline <svg> is deliberately not a form: it would wreck the readability
 * of a cast line, and a data: URI covers the same ground.
 */
function renderAvatar(speaker: Speaker): string {
  if (!speaker.avatar) return escapeHtml(initials(speaker.label));
  if (/^(https?:|\/\/|\/|data:)/.test(speaker.avatar)) {
    // referrerpolicy keeps a third-party avatar host from learning who is
    // reading the post.
    return (
      '<img src="' +
      escapeHtml(speaker.avatar) +
      '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />'
    );
  }
  if (speaker.avatar.startsWith('#')) {
    return '<svg aria-hidden="true"><use href="' + escapeHtml(speaker.avatar) + '"></use></svg>';
  }
  return escapeHtml(speaker.avatar);
}

/* --- render --------------------------------------------------------------- */

/**
 * Custom properties are namespaced --conv-* because --accent and --radius are
 * global site tokens; an un-prefixed --accent here would shadow the site's HSL
 * triplet for every descendant and resolve to an invalid colour.
 */
function speakerStyle(speaker: Speaker): string {
  if (!HEX.test(speaker.accent)) return '';
  const light = tintedBubble(speaker.accent, BUBBLE_BACKGROUND.light);
  const dark = tintedBubble(speaker.accent, BUBBLE_BACKGROUND.dark);
  return (
    '--conv-accent:' +
    speaker.accent +
    ';--conv-on-accent:' +
    textOnAccent(speaker.accent) +
    ';--conv-tint-light:' +
    light +
    ';--conv-tint-dark:' +
    dark +
    ';--conv-name-light:' +
    nameOnBackground(speaker.accent, PAGE_BACKGROUND.light) +
    ';--conv-name-dark:' +
    nameOnBackground(speaker.accent, PAGE_BACKGROUND.dark) +
    ';'
  );
}

export function renderConversation(source: string): string {
  const { items, options } = parseConversation(source);

  const body = items
    .map((item) => {
      if (item.type === 'note') {
        const rule = item.text ? '' : ' conv-note--rule';
        return '<div class="conv-note' + rule + '">' + escapeHtml(item.text) + '</div>';
      }

      const speaker = item.speaker;
      const style = speakerStyle(speaker);
      const bubbles = item.bubbles
        .map((bubble, index) => {
          const last = index === item.bubbles.length - 1 ? ' conv-bubble--last' : '';
          // Short single-line bubbles centre; anything that can wrap aligns to
          // start.
          const wide = bubble.text.length > 12 ? ' conv-bubble--wide' : '';
          return (
            '<div class="conv-bubble' +
            last +
            wide +
            '"><p>' +
            renderInline(bubble.text) +
            '</p></div>'
          );
        })
        .join('');

      // One name per run, above the stack. A `me` run keeps the label
      // screen-reader-only rather than dropping it: without it the message is
      // attributed by alignment and fill alone, which no screen reader can
      // perceive. Either way it is the first thing read in the run.
      const name =
        '<div class="conv-name' +
        (speaker.me ? ' conv-name--sr' : '') +
        '">' +
        escapeHtml(speaker.label) +
        '</div>';

      return (
        '<div class="conv-group conv-group--' +
        (speaker.me ? 'out' : 'in') +
        '"' +
        (style ? ' style="' + style + '"' : '') +
        '>' +
        '<div class="conv-avatar" aria-hidden="true">' +
        renderAvatar(speaker) +
        '</div>' +
        '<div class="conv-stack">' +
        name +
        bubbles +
        '</div>' +
        '</div>'
      );
    })
    .join('');

  const attributes = OPTION_NAMES.map(
    (option) => ' data-' + option + '="' + (options[option] ? 'on' : 'off') + '"',
  ).join('');

  return '<div class="conv"><div class="conv-thread"' + attributes + '>' + body + '</div></div>';
}
