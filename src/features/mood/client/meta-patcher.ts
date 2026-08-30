import type {
  MoodLiveCount,
  MoodLiveCountsResponse,
  MoodReaction,
} from '@bunizao/contracts/mood';

interface MoodMetaPatcherOptions {
  root?: ParentNode;
  readSource?: string;
  fetchCounts?: (ids: readonly string[]) => Promise<Record<string, MoodLiveCount>>;
}

interface MoodMetaPatcher {
  patch(ids: readonly string[]): Promise<void>;
  patchVisible(): Promise<void>;
}

const MAX_VISIBLE_IDS = 30;
// Live counts can add or remove reaction pills and comment chips, which
// changes item height. Patching 1200px ahead of the viewport keeps those
// changes offscreen (out of CLS) by the time the reader scrolls to them;
// 320px left the patch racing the scroll and shifting visible items.
const VIEWPORT_MARGIN_PX = 1200;
const LIVE_COUNTS_ENDPOINT = '/api/v2/moods/live-counts';

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

function collectVisibleMoodIds(root: ParentNode, excluded: ReadonlySet<string>): string[] {
  // Near-viewport posts first so they always fit the batch cap; the rest of
  // the rendered feed fills the remainder. Patching posts while they are
  // still offscreen keeps count-driven height changes out of CLS.
  const nearIds: string[] = [];
  const farIds: string[] = [];
  const seen = new Set<string>();

  root.querySelectorAll<HTMLElement>('[data-mood-id]').forEach((element) => {
    const id = element.dataset.moodId?.trim() ?? '';
    if (!id || seen.has(id) || excluded.has(id)) return;

    seen.add(id);
    (isInViewport(element) ? nearIds : farIds).push(id);
  });

  return [...nearIds, ...farIds].slice(0, MAX_VISIBLE_IDS);
}

function isMoodLiveCount(value: unknown): value is MoodLiveCount {
  if (typeof value !== 'object' || value === null) return false;
  const count = value as Partial<MoodLiveCount>;
  return (count.commentsCount === null || (typeof count.commentsCount === 'number' && Number.isFinite(count.commentsCount)))
    && (count.reactions === null || Array.isArray(count.reactions));
}

function readLiveCounts(value: unknown): Record<string, MoodLiveCount> {
  if (typeof value !== 'object' || value === null) return {};
  const counts = (value as Partial<MoodLiveCountsResponse>).counts;
  if (typeof counts !== 'object' || counts === null) return {};

  return Object.fromEntries(
    Object.entries(counts).filter(([, count]) => isMoodLiveCount(count)),
  );
}

async function fetchLiveCounts(ids: readonly string[]): Promise<Record<string, MoodLiveCount>> {
  if (!ids.length) return {};

  const query = new URLSearchParams({ ids: ids.join(',') });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${LIVE_COUNTS_ENDPOINT}?${query}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });
      if (!response.ok) throw new Error(`Mood live-counts request failed: ${response.status}`);
      return readLiveCounts(await response.json() as unknown);
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }

  return {};
}

function updateText(element: Element | null, value: string): void {
  if (!element || element.textContent === value) return;
  element.textContent = value;
}

function createReactionPill(reaction: MoodReaction): HTMLElement {
  const pill = document.createElement('span');
  pill.className = reaction.isPaid ? 'mood-reaction mood-reaction--paid' : 'mood-reaction';
  pill.dataset.moodReactionKey = getMoodReactionKey(reaction);

  const emoji = document.createElement('span');
  emoji.className = 'mood-reaction-emoji';
  if (reaction.isPaid) {
    emoji.textContent = '⭐';
  } else if (reaction.emojiImage || reaction.emojiId) {
    const wrapper = document.createElement('span');
    wrapper.className = 'tg-emoji';
    if (reaction.emojiId) wrapper.dataset.emojiId = reaction.emojiId;
    if (reaction.emojiImage) {
      const image = document.createElement('img');
      image.src = reaction.emojiImage;
      image.alt = reaction.emoji || 'emoji';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 16;
      image.height = 16;
      wrapper.appendChild(image);
    } else {
      wrapper.textContent = reaction.emoji;
    }
    emoji.appendChild(wrapper);
  } else {
    emoji.textContent = reaction.emoji;
  }

  const count = document.createElement('span');
  count.className = 'mood-reaction-count';
  count.textContent = reaction.count;
  pill.append(emoji, count);
  return pill;
}

function syncReactionsContainerVisibility(container: HTMLElement): void {
  const hasReactions = Boolean(container.querySelector('[data-mood-reaction-key]'));
  const hasComments = Boolean(container.querySelector('.mood-comments-wrapper:not(.is-hidden)'));
  container.classList.toggle('is-hidden', !hasReactions && !hasComments);
}

function patchReactionCounts(target: HTMLElement, reactions: readonly MoodReaction[]): void {
  const container = target.querySelector<HTMLElement>('.mood-item-reactions, .mood-post-reactions');
  if (!container) return;

  const pills = new Map<string, HTMLElement>();
  container.querySelectorAll<HTMLElement>('[data-mood-reaction-key]').forEach((pill) => {
    const key = pill.dataset.moodReactionKey;
    if (key) pills.set(key, pill);
  });

  const nextKeys = new Set(reactions.map(getMoodReactionKey));
  pills.forEach((pill, key) => {
    if (!nextKeys.has(key)) pill.remove();
  });

  reactions.forEach((reaction) => {
    const key = getMoodReactionKey(reaction);
    const pill = pills.get(key);
    if (pill) {
      updateText(pill.querySelector('.mood-reaction-count'), reaction.count);
      return;
    }
    container.appendChild(createReactionPill(reaction));
  });

  syncReactionsContainerVisibility(container);
}

function patchCommentCounts(target: HTMLElement, id: string, value: number): void {
  const count = Math.max(0, Math.trunc(value));
  const label = String(count);

  target.querySelectorAll<HTMLElement>(`.mood-comments-wrapper[data-post-id="${CSS.escape(id)}"]`).forEach((wrapper) => {
    wrapper.classList.toggle('is-hidden', count === 0);
    wrapper.dataset.commentsCount = label;
    wrapper.dataset.commentsLabel = label;

    const title = `${label} comment${count === 1 ? '' : 's'}`;
    const trigger = wrapper.querySelector<HTMLElement>('.mood-item-comments');
    if (trigger) trigger.title = title;

    const popover = wrapper.querySelector<HTMLElement>('.mood-comments-popover');
    if (popover) popover.setAttribute('aria-label', `${title} preview`);

    updateText(wrapper.querySelector('.mood-comments-count'), label);
  });

  const container = target.querySelector<HTMLElement>('.mood-item-reactions, .mood-post-reactions');
  if (container) syncReactionsContainerVisibility(container);
}

function patchMoodTarget(root: ParentNode, id: string, count: MoodLiveCount): void {
  root.querySelectorAll<HTMLElement>(`[data-mood-id="${CSS.escape(id)}"]`).forEach((target) => {
    if (count.reactions !== null) patchReactionCounts(target, count.reactions);
    if (count.commentsCount !== null) patchCommentCounts(target, id, count.commentsCount);
  });
}

export function createMoodMetaPatcher({
  root = document,
  readSource,
  fetchCounts = fetchLiveCounts,
}: MoodMetaPatcherOptions = {}): MoodMetaPatcher {
  const enabled = isArchiveSource(readSource);
  const attemptedIds = new Set<string>();
  const observed = new WeakSet<Element>();
  let pending: Promise<void> | null = null;
  let observer: IntersectionObserver | null = null;

  const patch = async (requestedIds: readonly string[]): Promise<void> => {
    if (!enabled) return;
    if (pending) await pending;

    const ids = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))]
      .filter((id) => !attemptedIds.has(id))
      .slice(0, MAX_VISIBLE_IDS);
    if (!ids.length) return;

    pending = fetchCounts(ids)
      .then((counts) => {
        // Mark ids attempted only on success so a failed fetch stays retryable.
        ids.forEach((id) => attemptedIds.add(id));
        Object.entries(counts).forEach(([id, count]) => patchMoodTarget(root, id, count));
      })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });

    await pending;
  };

  const observePosts = (): void => {
    if (!enabled || !('IntersectionObserver' in window)) return;
    observer ??= new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      void patchVisible();
    }, { rootMargin: `${VIEWPORT_MARGIN_PX}px 0px` });

    root.querySelectorAll<HTMLElement>('[data-mood-id]').forEach((element) => {
      if (observed.has(element)) return;
      observed.add(element);
      observer?.observe(element);
    });
  };

  const patchVisible = async (): Promise<void> => {
    if (!enabled) return;

    observePosts();
    const ids = collectVisibleMoodIds(root, attemptedIds);
    await patch(ids);
  };

  return { patch, patchVisible };
}
