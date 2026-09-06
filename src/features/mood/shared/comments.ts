export const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

interface FormatRelativeCommentDateOptions {
  compact?: boolean;
}

export const formatRelativeCommentDate = (
  datetime: string,
  options: FormatRelativeCommentDateOptions = {}
): string => {
  const timestamp = Date.parse(datetime);
  if (Number.isNaN(timestamp)) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return options.compact ? `${diffMins}m` : `${diffMins}m ago`;
  if (diffHours < 24) return options.compact ? `${diffHours}h` : `${diffHours}h ago`;
  if (diffDays < 7) return options.compact ? `${diffDays}d` : `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export interface CommentReplyTarget {
  id: string;
  author: string;
  text: string;
}

export const readCommentReplyTarget = (value: unknown): CommentReplyTarget | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = asText(raw.id).trim();
  const author = asText(raw.author).replace(/\s+/g, ' ').trim();
  const text = asText(raw.text).replace(/\s+/g, ' ').trim();
  if (!id || (!author && !text)) return null;
  return { id, author, text };
};

// Renders the parent preview of a reply. Pass `href` when the parent can be
// reached from the current page; without it the card is static.
export const createCommentReplyQuote = (replyTo: CommentReplyTarget, href = ''): HTMLElement => {
  const quoteWrap = document.createElement(href ? 'a' : 'div');
  quoteWrap.className = 'mood-item-quote mood-comment-quote';
  quoteWrap.dataset.replyToId = replyTo.id;
  if (quoteWrap instanceof HTMLAnchorElement) {
    quoteWrap.href = href;
  }

  if (replyTo.author) {
    const quoteMeta = document.createElement('div');
    quoteMeta.className = 'mood-item-quote-meta';

    const quoteAuthor = document.createElement('span');
    quoteAuthor.className = 'mood-item-quote-author';
    quoteAuthor.textContent = replyTo.author;

    quoteMeta.appendChild(quoteAuthor);
    quoteWrap.appendChild(quoteMeta);
  }

  if (replyTo.text) {
    const quoteText = document.createElement('p');
    quoteText.className = 'mood-item-quote-text';
    quoteText.textContent = replyTo.text;
    quoteWrap.appendChild(quoteText);
  }

  return quoteWrap;
};

export type CommentOrigin = 'telegram' | 'web';

/* Lucide `send` and a stripped-down `globe`, in the stroke idiom the rest of
   the mood surface uses. Two shapes, no colour: the thread is monochrome, so
   the glyph has to carry the meaning on its own. */
const SOURCE_ICONS: Record<CommentOrigin, string> = {
  telegram: '<path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" />',
  web: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />',
};

/** The "written on Telegram" / "written here" marker in a comment header.
    Glyph only: the label it used to carry made the header a third size in a
    row that already holds a name and a time, and widened every bubble to fit
    a word the shape already says. The name stays reachable as the accessible
    name and the hover title. */
export const createCommentSourceChip = (
  origin: CommentOrigin,
  title: string,
): HTMLElement => {
  const chip = document.createElement('span');
  chip.className = 'mood-comment-source';
  chip.dataset.origin = origin;
  chip.title = title;
  chip.setAttribute('role', 'img');
  chip.setAttribute('aria-label', title);

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = SOURCE_ICONS[origin];

  chip.appendChild(icon);
  return chip;
};

export const buildCommentContentFragment = (value: unknown): DocumentFragment => {
  const template = document.createElement('template');
  // `/api/comments` returns Telegram-scraped comment HTML; sanitization is
  // enforced upstream in `site-api` (see its plan 016).
  template.innerHTML = asText(value).trim();

  const normalized = document.createDocumentFragment();
  let paragraph: HTMLParagraphElement | null = null;

  const flushParagraph = (): void => {
    if (!paragraph) return;
    if (paragraph.textContent?.trim() || paragraph.querySelector('*')) {
      normalized.appendChild(paragraph);
    }
    paragraph = null;
  };

  Array.from(template.content.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
      if (paragraph) {
        paragraph.appendChild(node);
      }
      return;
    }

    const isBlockElement =
      node instanceof HTMLElement &&
      (node.classList.contains('mood-item-quote') ||
        ['P', 'DIV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL'].includes(node.tagName));

    if (isBlockElement) {
      flushParagraph();
      normalized.appendChild(node);
      return;
    }

    if (!paragraph) {
      paragraph = document.createElement('p');
    }
    paragraph.appendChild(node);
  });

  flushParagraph();
  return normalized;
};

/** What a periodic thread refresh keeps and what it drops, without touching
    the DOM. `loadedIds` is keyed by `comment.id` (a Telegram message id, or a
    temporary id for an optimistic own-comment row not yet bridged);
    `loadedSiteCommentIds` is keyed by `comment.commentId` (the site's own
    `Comment.id`, stable across the id a `web`-origin comment carries before
    and after the bridge assigns it a Telegram message id). A comment already
    on the page under either key is dropped, so a poll never renders the same
    comment twice under two different ids -- see
    plans/mood-comments-bridge.md "Read path: scrape plus overlay". */
export const dedupeNewComments = <T extends { id?: unknown; commentId?: unknown }>(
  comments: T[],
  loadedIds: ReadonlySet<string>,
  loadedSiteCommentIds: ReadonlySet<string>,
): T[] =>
  comments.filter((comment) => {
    const id = asText(comment?.id).trim();
    if (!id || loadedIds.has(id)) return false;
    const commentId = asText(comment?.commentId).trim();
    if (commentId && loadedSiteCommentIds.has(commentId)) return false;
    return true;
  });

export const sanitizeImageUrl = (value: unknown): string => {
  const raw = asText(value).trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};
