export const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
};

const sanitizeHref = (value: unknown): string => {
  const raw = asText(value).trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.origin === window.location.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.toString();
  } catch {
    if (/^(\/|#|\?)/.test(raw)) {
      return raw;
    }
    return '';
  }
};

const normalizeMultilineText = (value: string): string => {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const escapeForRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const stripLeadingAuthor = (value: string, author: string): string => {
  if (!author) return value.trim();
  return value.replace(new RegExp(`^${escapeForRegExp(author)}[\\s\\-–—:：]+`, 'i'), '').trim();
};

const extractMultilineText = (element: Element | null): string => {
  if (!element) return '';
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('br').forEach((lineBreak) => {
    lineBreak.replaceWith('\n');
  });
  clone.querySelectorAll('p, div, li').forEach((block) => {
    if (!block.textContent?.trim()) return;
    block.prepend(document.createTextNode('\n'));
    block.append(document.createTextNode('\n'));
  });
  return normalizeMultilineText(clone.textContent ?? '');
};

const createCommentQuote = (replyEl: Element): HTMLElement | null => {
  const authorSelectors = [
    '.tgme_widget_message_reply_author',
    '.tgme_widget_message_reply_title',
    '.tgme_widget_message_reply_name',
    '.tgme_widget_message_author_name',
  ];
  const author = authorSelectors
    .map((selector) => replyEl.querySelector(selector)?.textContent ?? '')
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .find(Boolean) ?? '';

  const replyTextEl = replyEl.querySelector('.js-message_reply_text, .tgme_widget_message_reply_text');
  const rawText = extractMultilineText(replyTextEl ?? replyEl);
  const text = stripLeadingAuthor(rawText, author);
  if (!text) return null;

  const href = sanitizeHref(replyEl.getAttribute('href') ?? '');
  const quoteWrap = document.createElement(href ? 'a' : 'div');
  quoteWrap.className = 'mood-item-quote mood-comment-quote';

  if (quoteWrap instanceof HTMLAnchorElement && href) {
    quoteWrap.href = href;
    if (/^https?:\/\//i.test(href)) {
      quoteWrap.target = '_blank';
      quoteWrap.rel = 'noopener noreferrer';
    }
  }

  if (author) {
    const quoteMeta = document.createElement('div');
    quoteMeta.className = 'mood-item-quote-meta';

    const quoteAuthor = document.createElement('span');
    quoteAuthor.className = 'mood-item-quote-author';
    quoteAuthor.textContent = author;

    quoteMeta.appendChild(quoteAuthor);
    quoteWrap.appendChild(quoteMeta);
  }

  const quoteText = document.createElement('p');
  quoteText.className = 'mood-item-quote-text';
  quoteText.textContent = text;
  quoteWrap.appendChild(quoteText);

  return quoteWrap;
};

export const replaceReplyNodesWithCommentQuotes = (root: ParentNode): void => {
  root.querySelectorAll('.tgme_widget_message_reply').forEach((replyNode) => {
    const quoteCard = createCommentQuote(replyNode as Element);
    if (quoteCard) {
      replyNode.replaceWith(quoteCard);
      return;
    }
    replyNode.remove();
  });
};

export const buildCommentContentFragment = (value: unknown): DocumentFragment => {
  const template = document.createElement('template');
  // `/api/comments` returns HTML sanitized in `src/features/mood/server/telegram-source.ts`.
  template.innerHTML = asText(value).trim();

  replaceReplyNodesWithCommentQuotes(template.content);

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
