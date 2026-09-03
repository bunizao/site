/* The comment box has said "Markdown supported" since the first draft of this
   feature, under an icon drawn specially for it. Nothing behind it was ever
   built: `Comment.body` is plain text, and both renderers put it on the page
   with `textContent` / `{comment.text}`, so every asterisk a reader typed came
   out as an asterisk. Same shape as the subscribe checkbox next to it -- a
   promise with no implementation -- and this is the half that was worth
   building rather than deleting.

   Deliberately small, and small in a way that is about comments rather than
   about parser weight. A comment is a paragraph or two of prose that sometimes
   wants a link, a quoted line, or a snippet of code; it never wants a heading,
   a table, or an image. Headings would let a comment out-shout the post it
   sits under, and images would let anyone paste a remote URL that every reader
   of the thread then requests. So the grammar here is the useful half:

     **bold**  *italic*  `code`  ```fenced```  > quote  - list  1. list
     [text](url)  and bare http(s) URLs

   No HTML is parsed out of the source and none is built from it on the client:
   the tree below is rendered with createElement/createTextNode, so a comment
   body is structurally incapable of becoming markup. The server renderer does
   build a string, so it escapes every text node and emits a closed tag set.

   Two renderers because there are two: CommentsSection.astro renders rows on
   the server (the components lab) and comments-controller.ts builds them in
   the browser (every real thread). They have to agree, so they share the tree
   and differ only in what they turn it into. */

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export type MdInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'link'; href: string; external: boolean; children: MdInline[] }
  /** A single newline inside a paragraph. Comments are typed in a textarea
      where Enter means "next line", not "next paragraph" -- honouring
      CommonMark's soft-break-is-a-space rule here would silently reflow
      something the writer had just laid out by hand. */
  | { type: 'break' };

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'quote'; children: MdInline[] }
  | { type: 'pre'; value: string }
  | { type: 'list'; ordered: boolean; items: MdInline[][] };

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** Absolute http(s), mailto, or a path on this site. Everything else -- most
    of all `javascript:` and `data:` -- comes back null and is rendered as the
    plain text it was written as, because a link a reader cannot see the
    destination of is worse than no link.

    The test anchors at the start of the trimmed string, so the usual dodges
    (`java\nscript:`, leading control characters, a scheme with padding) do not
    match and take the null path. Protocol-relative `//host` is excluded for
    the same reason: it reads local and is not. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\/\S+$/i.test(value)) return { href: value, external: true };
  if (/^mailto:\S+$/i.test(value)) return { href: value, external: false };
  if (/^\/(?!\/)\S*$/.test(value)) return { href: value, external: false };
  return null;
}

const AUTOLINK = /^https?:\/\/[^\s<>"'`]+/i;

/** A URL at the end of a sentence collects the sentence's punctuation. Give
    the trailing `.` `,` `!` back to the prose, and give back a `)` only when
    the URL has more closes than opens -- Wikipedia's `(disambiguation)` tails
    are real parts of the address. */
function trimUrlTail(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1]!;
    if ('.,;:!?"\''.includes(ch)) {
      end -= 1;
      continue;
    }
    if (ch === ')') {
      const slice = url.slice(0, end);
      const opens = (slice.match(/\(/g) ?? []).length;
      const closes = (slice.match(/\)/g) ?? []).length;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/** One left-to-right pass. Every branch either consumes a construct whole or
    falls through and keeps the character as literal text, so an unclosed `**`
    or a stray bracket renders as itself rather than eating the rest of the
    comment. */
function parseInline(src: string): MdInline[] {
  const out: MdInline[] = [];
  let buffer = '';

  const flush = (): void => {
    if (!buffer) return;
    out.push({ type: 'text', value: buffer });
    buffer = '';
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    if (ch === '\n') {
      flush();
      out.push({ type: 'break' });
      i += 1;
      continue;
    }

    // Code first, and only then everything else: inside a span, `**` and `[`
    // are the characters someone was trying to show, not markup.
    if (ch === '`') {
      const close = src.indexOf('`', i + 1);
      if (close > i + 1) {
        flush();
        out.push({ type: 'code', value: src.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    if (ch === '[') {
      const link = readLink(src, i);
      if (link) {
        flush();
        out.push(link.node);
        i = link.next;
        continue;
      }
    }

    if (ch === '*' || ch === '_') {
      // `snake_case` and `__init__` are code that happens to be typed as
      // prose, and are far more common in these comments than underscore
      // emphasis. An underscore only opens when it follows a boundary.
      const boundary = ch === '*' || !/[\p{L}\p{N}]/u.test(src[i - 1] ?? ' ');
      const emphasis = boundary ? readEmphasis(src, i, ch) : null;
      if (emphasis) {
        flush();
        out.push(emphasis.node);
        i = emphasis.next;
        continue;
      }
    }

    if ((ch === 'h' || ch === 'H') && AUTOLINK.test(src.slice(i))) {
      const matched = trimUrlTail(AUTOLINK.exec(src.slice(i))![0]);
      if (matched) {
        flush();
        out.push({ type: 'link', href: matched, external: true, children: [{ type: 'text', value: matched }] });
        i += matched.length;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out;
}

function readLink(src: string, start: number): { node: MdInline; next: number } | null {
  const close = src.indexOf(']', start + 1);
  if (close < 0 || src[close + 1] !== '(') return null;
  const end = src.indexOf(')', close + 2);
  if (end < 0) return null;
  const target = safeHref(src.slice(close + 2, end));
  if (!target) return null;
  const label = src.slice(start + 1, close);
  return {
    node: {
      type: 'link',
      href: target.href,
      external: target.external,
      children: label ? parseInline(label) : [{ type: 'text', value: target.href }],
    },
    next: end + 1,
  };
}

function readEmphasis(src: string, start: number, marker: string): { node: MdInline; next: number } | null {
  const strong = src[start + 1] === marker;
  const delimiter = strong ? marker + marker : marker;
  const from = start + delimiter.length;
  // `** bold**` is someone multiplying, not emphasising.
  if (!src[from] || /\s/.test(src[from]!)) return null;
  const close = src.indexOf(delimiter, from);
  if (close < 0 || close === from) return null;
  return {
    node: { type: strong ? 'strong' : 'em', children: parseInline(src.slice(from, close)) },
    next: close + delimiter.length,
  };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const FENCE = /^\s*```/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseCommentMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      // An unclosed fence runs to the end of the comment rather than
      // reverting to prose: someone who opened one meant everything under it.
      i += 1;
      blocks.push({ type: 'pre', value: body.join('\n') });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        body.push(QUOTE.exec(lines[i]!)![1]!);
        i += 1;
      }
      blocks.push({ type: 'quote', children: parseInline(body.join('\n')) });
      continue;
    }

    const marker = BULLET.test(line) ? BULLET : NUMBER.test(line) ? NUMBER : null;
    if (marker) {
      const items: MdInline[][] = [];
      while (i < lines.length && marker.test(lines[i]!)) {
        items.push(parseInline(marker.exec(lines[i]!)![1]!));
        i += 1;
      }
      blocks.push({ type: 'list', ordered: marker === NUMBER, items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !FENCE.test(lines[i]!)
      && !QUOTE.test(lines[i]!) && !BULLET.test(lines[i]!) && !NUMBER.test(lines[i]!)) {
      paragraph.push(lines[i]!);
      i += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Rendering: DOM (client) and string (server)
// ---------------------------------------------------------------------------

/** Every link a reader wrote, on both renderers. `ugc` and `nofollow` are what
    a comment link is; `noopener noreferrer` and a new tab are for off-site
    ones only -- a link to another post on this blog is navigation, and taking
    over the reader's tab for it would be the correct thing to do. */
function linkAttrs(node: { href: string; external: boolean }): Record<string, string> {
  if (!node.external) return { href: node.href };
  return { href: node.href, target: '_blank', rel: 'nofollow ugc noopener noreferrer' };
}

function inlineToDom(nodes: MdInline[], into: Node): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        into.appendChild(document.createTextNode(node.value));
        break;
      case 'break':
        into.appendChild(document.createElement('br'));
        break;
      case 'code': {
        const code = document.createElement('code');
        code.textContent = node.value;
        into.appendChild(code);
        break;
      }
      case 'link': {
        const anchor = document.createElement('a');
        for (const [key, value] of Object.entries(linkAttrs(node))) anchor.setAttribute(key, value);
        inlineToDom(node.children, anchor);
        into.appendChild(anchor);
        break;
      }
      default: {
        const wrap = document.createElement(node.type === 'strong' ? 'strong' : 'em');
        inlineToDom(node.children, wrap);
        into.appendChild(wrap);
      }
    }
  }
}

/** Replace `host`'s children with the rendered comment, and keep the source on
    the element. The raw text is what the edit field opens with and what Cancel
    compares against, and once the paragraph holds a tree it can no longer be
    read back out of `textContent`. */
export function setCommentText(host: HTMLElement, source: string): void {
  host.dataset.md = source;
  const fragment = document.createDocumentFragment();
  for (const block of parseCommentMarkdown(source)) {
    switch (block.type) {
      case 'pre': {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = block.value;
        pre.appendChild(code);
        fragment.appendChild(pre);
        break;
      }
      case 'quote': {
        const quote = document.createElement('blockquote');
        inlineToDom(block.children, quote);
        fragment.appendChild(quote);
        break;
      }
      case 'list': {
        const list = document.createElement(block.ordered ? 'ol' : 'ul');
        for (const item of block.items) {
          const li = document.createElement('li');
          inlineToDom(item, li);
          list.appendChild(li);
        }
        fragment.appendChild(list);
        break;
      }
      default: {
        const paragraph = document.createElement('p');
        inlineToDom(block.children, paragraph);
        fragment.appendChild(paragraph);
      }
    }
  }
  host.replaceChildren(fragment);
}

/** What the reader typed, not what it renders as. */
export function readCommentText(host: HTMLElement | null): string {
  return host?.dataset.md ?? host?.textContent ?? '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineToHtml(nodes: MdInline[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return escapeHtml(node.value);
      case 'break': return '<br>';
      case 'code': return `<code>${escapeHtml(node.value)}</code>`;
      case 'link': {
        const attrs = Object.entries(linkAttrs(node))
          .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
          .join('');
        return `<a${attrs}>${inlineToHtml(node.children)}</a>`;
      }
      default: {
        const tag = node.type === 'strong' ? 'strong' : 'em';
        return `<${tag}>${inlineToHtml(node.children)}</${tag}>`;
      }
    }
  }).join('');
}

/** The server half. Only ever emits the closed tag set above, and every string
    that came from a reader goes through escapeHtml on the way in -- there is
    no path from comment source to markup. */
export function commentMarkdownToHtml(source: string): string {
  return parseCommentMarkdown(source).map((block) => {
    switch (block.type) {
      case 'pre': return `<pre><code>${escapeHtml(block.value)}</code></pre>`;
      case 'quote': return `<blockquote>${inlineToHtml(block.children)}</blockquote>`;
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        return `<${tag}>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join('')}</${tag}>`;
      }
      default: return `<p>${inlineToHtml(block.children)}</p>`;
    }
  }).join('');
}
