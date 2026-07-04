import type { MoodMetaItem, MoodReaction } from '@bunizao/contracts/mood';

interface MoodMetaPatcherOptions {
  root?: ParentNode;
  readSource?: string;
}

interface MoodMetaPatcher {
  patchVisible(): Promise<void>;
}

const MAX_VISIBLE_IDS = 50;
const VIEWPORT_MARGIN_PX = 320;
const META_ENDPOINT = '/api/v1/mood/meta';

export function getMoodReactionKey(reaction: Pick<MoodReaction, 'emoji' | 'emojiId' | 'emojiImage' | 'isPaid'>): string {
  if (reaction.isPaid) return `paid:${reaction.emoji || 'star'}`;
  if (reaction.emojiId) return `id:${reaction.emojiId}`;
  if (reaction.emojiImage) return `image:${reaction.emojiImage}`;
  return `emoji:${reaction.emoji || ''}`;
}

function isArchiveSource(value?: string): boolean {
  return value?.trim().toLowerCase() === 'archive';
}

function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.bottom >= -VIEWPORT_MARGIN_PX && rect.top <= window.innerHeight + VIEWPORT_MARGIN_PX;
}

function collectVisibleMoodIds(root: ParentNode): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  root.querySelectorAll<HTMLElement>('[data-mood-id]').forEach((element) => {
    if (ids.length >= MAX_VISIBLE_IDS) return;
    if (!isInViewport(element)) return;

    const id = element.dataset.moodId?.trim() ?? '';
    if (!id || seen.has(id)) return;

    seen.add(id);
    ids.push(id);
  });

  return ids;
}

async function fetchMoodMeta(ids: readonly string[]): Promise<MoodMetaItem[]> {
  if (!ids.length) return [];

  const query = new URLSearchParams({ ids: ids.join(',') });
  const response = await fetch(`${META_ENDPOINT}?${query}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Mood meta request failed: ${response.status}`);
  }

  const data = await response.json() as unknown;
  return Array.isArray(data) ? data.filter(isMoodMetaItem) : [];
}

function isMoodMetaItem(value: unknown): value is MoodMetaItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<MoodMetaItem>;
  return typeof item.id === 'string'
    && Array.isArray(item.reactions)
    && typeof item.commentsCount === 'number'
    && Number.isFinite(item.commentsCount);
}

function updateText(element: Element | null, value: string): void {
  if (!element || element.textContent === value) return;
  element.textContent = value;
}

function formatCommentsCount(value: number): string {
  return String(Math.max(0, Math.trunc(value)));
}

function patchReactionCounts(target: HTMLElement, reactions: readonly MoodReaction[]): void {
  const pills = new Map<string, HTMLElement>();
  target.querySelectorAll<HTMLElement>('[data-mood-reaction-key]').forEach((pill) => {
    const key = pill.dataset.moodReactionKey;
    if (key) pills.set(key, pill);
  });

  reactions.forEach((reaction) => {
    const pill = pills.get(getMoodReactionKey(reaction));
    if (!pill) return;
    updateText(pill.querySelector('.mood-reaction-count'), reaction.count);
  });
}

function patchCommentCounts(target: HTMLElement, item: MoodMetaItem): void {
  const count = Math.max(0, Math.trunc(item.commentsCount));
  const label = formatCommentsCount(count);

  target.querySelectorAll<HTMLElement>(`.mood-comments-wrapper[data-post-id="${CSS.escape(item.id)}"]`).forEach((wrapper) => {
    wrapper.dataset.commentsCount = label;
    wrapper.dataset.commentsLabel = label;

    const title = `${label} comment${count === 1 ? '' : 's'}`;
    const trigger = wrapper.querySelector<HTMLElement>('.mood-item-comments');
    if (trigger) {
      trigger.title = title;
    }

    const popover = wrapper.querySelector<HTMLElement>('.mood-comments-popover');
    if (popover) {
      popover.setAttribute('aria-label', `${title} preview`);
    }

    updateText(wrapper.querySelector('.mood-comments-count'), label);
  });
}

function patchMoodTarget(root: ParentNode, item: MoodMetaItem): void {
  root.querySelectorAll<HTMLElement>(`[data-mood-id="${CSS.escape(item.id)}"]`).forEach((target) => {
    patchReactionCounts(target, item.reactions);
    patchCommentCounts(target, item);
  });
}

export function createMoodMetaPatcher({
  root = document,
  readSource,
}: MoodMetaPatcherOptions = {}): MoodMetaPatcher {
  const enabled = isArchiveSource(readSource);
  let pending: Promise<void> | null = null;

  const patchVisible = async (): Promise<void> => {
    if (!enabled || pending) return pending ?? Promise.resolve();

    pending = (async () => {
      const ids = collectVisibleMoodIds(root);
      const items = await fetchMoodMeta(ids);
      items.forEach((item) => patchMoodTarget(root, item));
    })().catch((error) => {
      console.warn('Failed to patch mood live meta:', error);
    }).finally(() => {
      pending = null;
    });

    return pending;
  };

  return { patchVisible };
}
