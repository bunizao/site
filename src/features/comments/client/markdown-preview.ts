// Live Markdown preview for every comment compose field. It intentionally
// renders through comment-markdown.ts, the same parser used by published rows,
// so the preview cannot promise syntax that the final comment will drop.

import { copyFor } from '@/features/comments/copy';
import { setCommentText } from '@/features/comments/comment-markdown';

const DEBOUNCE_MS = 120;
const panes = new WeakMap<HTMLTextAreaElement, HTMLElement>();
const timers = new WeakMap<HTMLTextAreaElement, number>();
let initialized = false;

type MarkdownShortcut = {
  before: string;
  after: string;
  placeholder: string;
  selectAfter?: string;
};

const SHORTCUTS: Record<string, MarkdownShortcut> = {
  b: { before: '**', after: '**', placeholder: 'bold text' },
  i: { before: '*', after: '*', placeholder: 'italic text' },
  e: { before: '`', after: '`', placeholder: 'code' },
  k: { before: '[', after: '](https://)', placeholder: 'link text', selectAfter: 'https://' },
};

/** Whether the supported comment subset changes how this draft is displayed. */
export function looksLikeCommentMarkdown(source: string): boolean {
  return (
    /\*\*[^\s*](?:.|\n)*?\*\*/u.test(source)
    || /(^|\s)\*[^\s*](?:.|\n)*?\*(?=$|\s|\p{P})/mu.test(source)
    || /`[^`\n]+`|^```/m.test(source)
    || /\[[^\]]+\]\(https?:\/\/[^)]+\)/u.test(source)
    || /https?:\/\/\S+/u.test(source)
    || /^\s{0,3}>\s?/m.test(source)
    || /^\s{0,3}(?:[-*]|\d+\.)\s+/m.test(source)
  );
}

function paneFor(field: HTMLTextAreaElement): HTMLElement {
  const existing = panes.get(field);
  if (existing) return existing;

  const pane = document.createElement('div');
  pane.className = 'blog-compose__preview';
  pane.setAttribute('role', 'region');
  pane.setAttribute('aria-label', copyFor(field).preview);
  pane.hidden = true;

  const tag = document.createElement('span');
  tag.className = 'blog-compose__preview-tag';
  tag.textContent = copyFor(field).preview;

  const body = document.createElement('div');
  body.className = 'blog-compose__preview-body blog-comment__text';
  pane.append(tag, body);
  field.after(pane);
  panes.set(field, pane);
  return pane;
}

function close(field: HTMLTextAreaElement): void {
  const pane = panes.get(field);
  if (!pane) return;
  pane.hidden = true;
  pane.querySelector('.blog-compose__preview-body')?.replaceChildren();
}

function refresh(field: HTMLTextAreaElement): void {
  const source = field.value;
  if (!source.trim()) {
    close(field);
    return;
  }

  const current = panes.get(field);
  if ((!current || current.hidden) && !looksLikeCommentMarkdown(source)) return;

  const pane = paneFor(field);
  const body = pane.querySelector<HTMLElement>('.blog-compose__preview-body');
  if (!body) return;
  setCommentText(body, source);
  pane.hidden = false;
}

function schedule(field: HTMLTextAreaElement): void {
  window.clearTimeout(timers.get(field));
  timers.set(field, window.setTimeout(() => refresh(field), DEBOUNCE_MS));
}

function applyShortcut(field: HTMLTextAreaElement, shortcut: MarkdownShortcut): void {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const selected = field.value.slice(start, end);
  const content = selected || shortcut.placeholder;
  const replacement = `${shortcut.before}${content}${shortcut.after}`;
  const scrollTop = field.scrollTop;

  field.setRangeText(replacement, start, end, 'end');
  field.focus();
  field.scrollTop = scrollTop;

  if (!selected) {
    field.setSelectionRange(start + shortcut.before.length, start + shortcut.before.length + content.length);
  } else if (shortcut.selectAfter) {
    const suffixStart = start + shortcut.before.length + content.length + shortcut.after.indexOf(shortcut.selectAfter);
    field.setSelectionRange(suffixStart, suffixStart + shortcut.selectAfter.length);
  }

  field.dispatchEvent(new Event('input', { bubbles: true }));
}

export function clearCommentMarkdownPreview(field: HTMLTextAreaElement | null | undefined): void {
  if (!field) return;
  window.clearTimeout(timers.get(field));
  close(field);
}

/** One delegated listener also covers the reply box built after page load. */
export function initCommentMarkdownPreview(root: ParentNode = document): void {
  root.querySelectorAll<HTMLTextAreaElement>('.blog-compose__field').forEach((field) => {
    field.setAttribute('aria-keyshortcuts', 'Control+B Meta+B Control+I Meta+I Control+E Meta+E Control+K Meta+K');
    refresh(field);
  });
  if (initialized) return;
  initialized = true;
  document.addEventListener('input', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLTextAreaElement) || !field.classList.contains('blog-compose__field')) return;
    schedule(field);
  });
  document.addEventListener('keydown', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLTextAreaElement) || !field.classList.contains('blog-compose__field')) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const shortcut = SHORTCUTS[event.key.toLowerCase()];
    if (!shortcut) return;
    event.preventDefault();
    applyShortcut(field, shortcut);
  });
}
