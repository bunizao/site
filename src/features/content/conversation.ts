// Renders a ```conversation fenced block into a chat thread.
//
// Pure source -> HTML. No client JS, no DOM, no imports: the same function runs
// in the Ghost prose path, the markdown path, and unit tests. Everything the
// browser needs is in the markup plus conversation.css.
//
// Syntax (see docs/CONVERSATION-SYNTAX.md):
//
//   @you me avatar=🙋                     cast line: declare a speaker
//   @tutu label="Tu Tu" accent=#B4603A
//
//   you: how wide should a bubble be?     message
//   tutu: 30em.
//   tutu: A CJK glyph is 1em and a Latin
//     glyph about half that.              indented -> soft wrap, same bubble
//   --- later                             divider, with or without a label
//
// Speakers are auto-registered on first use, so the two-party case needs no
// cast lines at all.

export const CONVERSATION_LANGUAGE = 'conversation';

export function isConversationLanguage(lang: string): boolean {
  return lang.toLowerCase() === CONVERSATION_LANGUAGE;
}

/** A declared or auto-registered participant. */
interface Speaker {
  key: string;
  label: string;
  avatar: string;
  /** Renders on the trailing side with the filled bubble. At most one wins. */
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

const DECLARATION = /^@([^\s:]+)\s*(.*)$/;
const ATTRIBUTE = /(\w+)=("[^"]*"|\S+)/g;
const MESSAGE = /^([^\s:：][^:：]{0,23})[:：]\s*(.*)$/;

/**
 * A head like `https` or `note` would otherwise turn a URL or a stray colon
 * into a phantom speaker, and Markdown punctuation in the head means the line
 * is prose, not an attribution.
 */
function isPlausibleName(head: string): boolean {
  return !/^(https?|mailto|tel|ftp)$/i.test(head) && !/[`*[\]()]/.test(head);
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

export function parseConversation(source: string): { cast: Map<string, Speaker>; items: Item[] } {
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

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const indented = /^\s+\S/.test(raw);

    // A blank line ends the current bubble, so the next message from the same
    // speaker starts a new one instead of appending a paragraph.
    if (!line) {
      bubble = null;
      continue;
    }

    const declaration = !indented ? DECLARATION.exec(line) : null;
    if (declaration) {
      const target = speaker(declaration[1]);
      if (/(^|\s)me(\s|$)/.test(declaration[2])) target.me = true;

      ATTRIBUTE.lastIndex = 0;
      let attribute: RegExpExecArray | null;
      while ((attribute = ATTRIBUTE.exec(declaration[2]))) {
        const value = attribute[2].replace(/^"|"$/g, '');
        if (attribute[1] === 'accent') target.accent = value;
        else if (attribute[1] === 'avatar') target.avatar = value;
        else if (attribute[1] === 'label') target.label = value;
      }
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
    if (message && head && (cast.has(head.toLowerCase()) || isPlausibleName(head))) {
      const target = speaker(head);
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

    if (bubble) {
      bubble.text = joinWrapped(bubble.text, line);
      continue;
    }
    items.push({ type: 'note', text: line });
  }

  // With no explicit `me`, the first voice on stage owns the trailing side. An
  // author writing a two-party exchange gets the right layout for free.
  if (![...cast.values()].some((s) => s.me) && firstVoice) firstVoice.me = true;

  return { cast, items };
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
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/* --- contrast -------------------------------------------------------------
   Only runs when an author opts into a custom accent. The default is
   monochrome and derives from --foreground in CSS, where it is AA by
   construction in both themes and needs no maths at all. */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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
 * reused as name text. Walk it toward the far end of the bubble in 4% steps
 * until it clears AA, keeping as much of the chosen hue as the ratio allows.
 */
export function nameOnBubble(accent: string, bubbleBackground: string): string {
  const floor = toRgb(bubbleBackground);
  const start = toRgb(accent);
  const target = luminance(floor) > 0.4 ? 0 : 255;
  for (let t = 0; t < 1; t += 0.04) {
    const walked = start.map((v) => v + (target - v) * t);
    if (contrastRatio(walked as [number, number, number], floor) >= 4.5) return toHex(walked);
  }
  return target ? '#FFFFFF' : '#000000';
}

/**
 * --conv-neutral composited over each theme's page background: the floor a name
 * actually sits on. Measured from the rendered component, not assumed — the
 * bubble is what the eye compares against, not the page.
 */
const BUBBLE_BACKGROUND = { light: '#ECECEC', dark: '#232323' };

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
  return (
    '--conv-accent:' +
    speaker.accent +
    ';--conv-on-accent:' +
    textOnAccent(speaker.accent) +
    ';--conv-name-light:' +
    nameOnBubble(speaker.accent, BUBBLE_BACKGROUND.light) +
    ';--conv-name-dark:' +
    nameOnBubble(speaker.accent, BUBBLE_BACKGROUND.dark) +
    ';'
  );
}

export function renderConversation(source: string): string {
  const { items } = parseConversation(source);

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
          // The top bubble of a run carries the speaker. A `me` run keeps the
          // label screen-reader-only rather than dropping it: without it the
          // message is attributed by alignment and fill alone, which no screen
          // reader can perceive.
          const labelled = index === 0;
          const visible = labelled && !speaker.me;
          // Short single-line bubbles centre; anything that can wrap, or that
          // carries a visible name, aligns to start.
          const wide = visible || bubble.text.length > 12 ? ' conv-bubble--wide' : '';
          const name = labelled
            ? '<div class="conv-name' +
              (visible ? '' : ' conv-name--sr') +
              '">' +
              escapeHtml(speaker.label) +
              '</div>'
            : '';
          return (
            '<div class="conv-bubble' +
            last +
            wide +
            '">' +
            name +
            '<p>' +
            renderInline(bubble.text) +
            '</p>' +
            '</div>'
          );
        })
        .join('');

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
        bubbles +
        '</div>' +
        '</div>'
      );
    })
    .join('');

  return '<div class="conv"><div class="conv-thread">' + body + '</div></div>';
}
