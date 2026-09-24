export interface MoodPreviewOptions {
  decorateEmoji?: (emoji: HTMLSpanElement) => void;
  preserveRichTextTags?: boolean;
  /** Show a bare URL as `host/path` instead of the full address. */
  compactUrls?: boolean;
}

const COMPACT_URL_MAX = 32;

/**
 * The label for a link whose text is its own address. Drops the scheme,
 * `www.`, the query, the hash and a trailing slash, so
 * `https://x.com/a/status/123?s=46` reads `x.com/a/status/123`. A label still
 * longer than COMPACT_URL_MAX keeps the host and first path segment and
 * elides the rest: the owner is what a reader scans for, not the post id.
 */
export function formatUrlLabel(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const path = decodePath(parsed.pathname).replace(/\/+$/, '');
  const label = host + path;
  if (label.length <= COMPACT_URL_MAX) return label;
  const [first] = path.split('/').filter(Boolean);
  if (!first) return label;
  const room = COMPACT_URL_MAX - host.length - 1;
  const owner = Array.from(first);
  return owner.length <= room ? `${host}/${first}/…` : `${host}/${owner.slice(0, Math.max(room, 8)).join('')}…`;
}

// `URL.pathname` is percent-encoded, which turns a CJK slug into `%E4%B8…`.
function decodePath(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

function isSafeEmojiImageSrc(value: string): boolean {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  return /^[/?]/.test(value);
}

function linkifyText(value: string, options: MoodPreviewOptions = {}): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!value) return fragment;

  const urlPattern = /https?:\/\/[^\s]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(value)) !== null) {
    const matchText = match[0];
    const start = match.index;

    if (start > lastIndex) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex, start)));
    }

    let url = matchText;
    let trailing = '';
    while (/[)\].,!?:;]+$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.textContent = options.compactUrls ? formatUrlLabel(url) : url;
    if (options.compactUrls) anchor.title = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    fragment.appendChild(anchor);

    if (trailing) {
      fragment.appendChild(document.createTextNode(trailing));
    }

    lastIndex = start + matchText.length;
  }

  if (lastIndex < value.length) {
    fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
  }

  return fragment;
}

function linkifyHtml(value: string, options: MoodPreviewOptions): DocumentFragment {
  const fragment = document.createDocumentFragment();
  if (!value) return fragment;

  const template = document.createElement('template');
  template.innerHTML = value;

  const appendNode = (node: ChildNode, target: DocumentFragment | HTMLElement): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(linkifyText(node.textContent ?? '', options));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') {
      return;
    }

    if (tag === 'a') {
      const anchor = document.createElement('a');
      const href = element.getAttribute('href') ?? '';
      const text = element.textContent ?? '';
      const bare = options.compactUrls && href !== '' && text.trim() === href;
      anchor.textContent = bare ? formatUrlLabel(href) : text;
      if (bare) anchor.title = href;
      if (href) {
        anchor.href = href;
        if (/^https?:\/\//i.test(href)) {
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
        }
      }
      target.appendChild(anchor);
      return;
    }

    if (tag === 'span') {
      const className = element.getAttribute('class') ?? '';
      if (/\b(tg-emoji|mood-reaction-emoji)\b/.test(className)) {
        const emoji = document.createElement('span');
        emoji.className = 'tg-emoji';

        const emojiId = element.getAttribute('data-emoji-id');
        if (emojiId) {
          emoji.dataset.emojiId = emojiId;
        }

        const animated = element.getAttribute('data-emoji-animated');
        if (animated === 'true' || animated === 'false') {
          emoji.dataset.emojiAnimated = animated;
        }

        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
          emoji.setAttribute('aria-label', ariaLabel);
        }

        options.decorateEmoji?.(emoji);
        element.childNodes.forEach((child) => appendNode(child, emoji));
        target.appendChild(emoji);
        return;
      }
    }

    if (tag === 'img') {
      const src = (element.getAttribute('src') ?? '').trim();
      if (!src) return;

      const isEmojiImage = Boolean(element.closest('.tg-emoji, .mood-reaction-emoji'))
        || src.toLowerCase().includes('/i/emoji/');
      if (!isEmojiImage || !isSafeEmojiImageSrc(src)) {
        return;
      }

      const image = document.createElement('img');
      image.src = src;
      image.alt = element.getAttribute('alt') ?? '';
      image.loading = 'lazy';
      image.decoding = 'async';
      if (element.classList.contains('tg-emoji-fallback')) {
        image.className = 'tg-emoji-fallback';
      }
      target.appendChild(image);
      return;
    }

    if (tag === 'br') {
      target.appendChild(document.createElement('br'));
      return;
    }

    const richTextTags = ['blockquote', 'pre', 'code', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'strike'];
    if (options.preserveRichTextTags && richTextTags.includes(tag)) {
      const next = document.createElement(tag);
      element.childNodes.forEach((child) => appendNode(child, next));
      target.appendChild(next);
      return;
    }

    element.childNodes.forEach((child) => appendNode(child, target));
  };

  template.content.childNodes.forEach((child) => appendNode(child, fragment));
  return fragment;
}

export function buildMoodPreviewFragment(
  previewText: string,
  previewHtml?: string,
  options: MoodPreviewOptions = {}
): DocumentFragment {
  const html = typeof previewHtml === 'string' ? previewHtml.trim() : '';
  if (html) {
    return linkifyHtml(html, options);
  }
  return linkifyText(previewText, options);
}
