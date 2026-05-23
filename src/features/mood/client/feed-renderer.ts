import { createMoodGalleryElement, initMoodGalleries } from '@/features/mood/client/gallery';
import { buildMoodPreviewFragment } from '@/features/mood/shared/preview';
import type { ChannelInfo, MoodData } from '@/features/mood/client/feed-types';

interface FeedCommentsPopover {
  createIndicator(options: { postId: string; count: number; label: string }): HTMLElement;
}

interface FeedMediaHydrator {
  setImageHints(img: HTMLImageElement, options?: { priority?: boolean; lazy?: boolean }): void;
  applyMediaHints(root: HTMLElement, priority?: boolean): void;
  hydrateDeferredImage(img: HTMLImageElement): void;
  registerDeferredImage(target: Element, hydrate: () => void): void;
  applyResponsiveImage(img: HTMLImageElement, src: string): void;
}

interface FeedRendererOptions {
  list: HTMLElement;
  commentsPopover: FeedCommentsPopover;
  mediaHydrator: FeedMediaHydrator;
  getChannelInfo: () => ChannelInfo | null;
  formatDateKey: (value: string) => string;
}

interface FeedRenderer {
  bindInteractions(): void;
  appendMoods(posts: MoodData[], startIndex?: number): number;
  scrollToMood(id: string, options?: { highlight?: boolean }): boolean;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateHeader(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear()
    && date.getMonth() === yesterday.getMonth()
    && date.getDate() === yesterday.getDate();
  if (isYesterday) return 'Yesterday';

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  if (date.getFullYear() === now.getFullYear()) {
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }

  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function isLongContent(text: string): boolean {
  return (text || '').length > 280;
}

function buildPreviewFragment(previewText: string, previewHtml?: string): DocumentFragment {
  return buildMoodPreviewFragment(previewText, previewHtml, {
    preserveRichTextTags: true,
  });
}

function getQuoteTargetId(href: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(/\/mood\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function removeBrokenQuoteMedia(img: HTMLImageElement, quoteWrap: HTMLElement): void {
  img.addEventListener('error', () => {
    img.closest('.mood-item-quote-media')?.remove();
    quoteWrap.classList.remove('mood-item-quote--with-media', 'mood-item-quote--media-only');
    if (quoteWrap.textContent?.trim()) return;
    quoteWrap.remove();
  }, { once: true });
}

function getCommentsCountInfo(value: MoodData['commentsCount']): { count: number; label: string } {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { count: value, label: String(value) };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { count: 0, label: '' };
    }

    const direct = Number(trimmed.replace(/,/g, ''));
    if (Number.isFinite(direct)) {
      return { count: direct, label: trimmed };
    }

    const match = trimmed.match(/(\d+(?:[.,]\d+)?)(\s*[kKmM])?/);
    if (!match) {
      return { count: 0, label: '' };
    }

    let count = Number(match[1].replace(',', '.'));
    const suffix = match[2]?.trim() ?? '';
    if (/k/i.test(suffix)) {
      count *= 1000;
    } else if (/m/i.test(suffix)) {
      count *= 1_000_000;
    }

    if (!Number.isFinite(count)) {
      return { count: 0, label: '' };
    }

    return { count, label: trimmed };
  }

  return { count: 0, label: '' };
}

export function createFeedRenderer({
  list,
  commentsPopover,
  mediaHydrator,
  getChannelInfo,
  formatDateKey,
}: FeedRendererOptions): FeedRenderer {
  const groupCache = new Map<string, { group: HTMLElement; items: HTMLElement }>();
  const renderedIdSet = new Set<string>();
  let interactionsBound = false;
  let priorityMediaClaimed = Boolean(
    list.querySelector('[data-mood-gallery-priority="true"], img[fetchpriority="high"]')
  );

  list.querySelectorAll<HTMLElement>('[data-mood-id]').forEach((item) => {
    const id = item.dataset.moodId;
    if (id) {
      renderedIdSet.add(id);
    }
  });

  const normalizeAuthorName = (value: string): string =>
    value.replace(/\s+/g, ' ').trim().replace(/^@/, '').toLowerCase().replace(/[^\w-]+$/g, '');

  const shouldHideQuoteAuthor = (value?: string): boolean => {
    if (!value) return false;
    const channelInfo = getChannelInfo();
    const normalized = normalizeAuthorName(value);
    const slug = channelInfo?.slug ? normalizeAuthorName(channelInfo.slug) : '';
    const title = channelInfo?.title ? normalizeAuthorName(channelInfo.title) : '';
    return Boolean((slug && normalized === slug) || (title && normalized === title));
  };

  const getGroupEntry = (dateKey: string): { group: HTMLElement; items: HTMLElement } | null => {
    const cached = groupCache.get(dateKey);
    if (cached) return cached;

    const existingGroup = list.querySelector<HTMLElement>(`[data-date="${dateKey}"]`);
    if (!existingGroup) return null;

    const items = existingGroup.querySelector<HTMLElement>('.mood-date-items');
    if (!items) return null;

    const entry = { group: existingGroup, items };
    groupCache.set(dateKey, entry);
    return entry;
  };

  const highlightMood = (target: HTMLElement): void => {
    target.classList.remove('mood-item--anchored');
    window.requestAnimationFrame(() => {
      target.classList.add('mood-item--anchored');
      window.setTimeout(() => {
        target.classList.remove('mood-item--anchored');
      }, 2600);
    });
  };

  const scrollToMood = (id: string, options: { highlight?: boolean } = {}): boolean => {
    const target = Array.from(list.querySelectorAll<HTMLElement>('[data-mood-id]')).find(
      (item) => item.dataset.moodId === id
    ) ?? null;
    if (!target) return false;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
    if (options.highlight) {
      highlightMood(target);
    }
    return true;
  };

  const createMoodItem = (mood: MoodData, index: number): HTMLElement => {
    const mediaHtml = typeof mood.mediaHtml === 'string' ? mood.mediaHtml.trim() : '';
    const hasMediaHtml = mediaHtml.length > 0;
    const previewMediaType = typeof mood.previewMediaType === 'string' ? mood.previewMediaType.trim() : '';
    const needsDetailPage = typeof mood.needsDetailPage === 'boolean'
      ? mood.needsDetailPage
      : isLongContent(mood.previewText);
    const shouldLink = needsDetailPage && !hasMediaHtml;
    const element = document.createElement('div');

    if (shouldLink) {
      element.className = 'mood-item mood-item--clickable';
      element.dataset.href = `/mood/${mood.id}`;
      element.setAttribute('role', 'link');
      element.tabIndex = 0;
    } else {
      element.className = 'mood-item';
    }

    element.dataset.moodId = mood.id;
    element.style.setProperty('--item-index', String(index));

    const time = document.createElement('time');
    time.className = 'mood-item-time';
    time.dateTime = mood.datetime;
    time.textContent = formatTime(mood.datetime);

    const content = document.createElement('div');
    content.className = 'mood-item-content';

    const forwardedFrom = mood.forwardedFrom && mood.forwardedFrom.name ? mood.forwardedFrom : null;
    if (forwardedFrom) {
      const forwarded = document.createElement('div');
      forwarded.className = 'mood-item-forwarded';

      const label = document.createElement('span');
      label.className = 'mood-forwarded-label';
      label.textContent = 'Forwarded from';
      forwarded.appendChild(label);

      const source = document.createElement(forwardedFrom.href ? 'a' : 'span');
      source.className = 'mood-forwarded-source';
      source.textContent = forwardedFrom.name;
      if (source instanceof HTMLAnchorElement && forwardedFrom.href) {
        source.href = forwardedFrom.href;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
      }
      forwarded.appendChild(source);

      const author = forwardedFrom.author && forwardedFrom.author !== forwardedFrom.name
        ? forwardedFrom.author
        : '';
      if (author) {
        const authorSpan = document.createElement('span');
        authorSpan.className = 'mood-forwarded-author';
        authorSpan.textContent = `(${author})`;
        forwarded.appendChild(authorSpan);
      }

      content.appendChild(forwarded);
    }

    const quote = mood.quote && mood.quote.text ? mood.quote : null;
    if (quote) {
      const quoteWrap = document.createElement(quote.href ? 'a' : 'div');
      quoteWrap.className = 'mood-item-quote';
      const isMediaOnlyQuote = Boolean(quote.thumbnailSrc && /^(Media|Video)$/i.test(quote.text));
      if (isMediaOnlyQuote) {
        quoteWrap.classList.add('mood-item-quote--media-only');
      } else if (quote.thumbnailSrc) {
        quoteWrap.classList.add('mood-item-quote--with-media');
      }
      if (quoteWrap instanceof HTMLAnchorElement && quote.href) {
        quoteWrap.href = quote.href;
        if (/^https?:\/\//i.test(quote.href)) {
          quoteWrap.target = '_blank';
          quoteWrap.rel = 'noopener noreferrer';
        }
      }
      const quoteTargetId = quote.href ? getQuoteTargetId(quote.href) : null;
      if (quoteTargetId) {
        quoteWrap.dataset.quoteId = quoteTargetId;
      }

      if (quote.thumbnailSrc) {
        const quoteMedia = document.createElement('span');
        quoteMedia.className = 'mood-item-quote-media';

        const quoteImage = document.createElement('img');
        quoteImage.className = 'mood-item-quote-image';
        quoteImage.src = quote.thumbnailSrc;
        quoteImage.alt = '';
        quoteImage.loading = 'lazy';
        quoteImage.decoding = 'async';
        removeBrokenQuoteMedia(quoteImage, quoteWrap);

        quoteMedia.appendChild(quoteImage);
        quoteWrap.appendChild(quoteMedia);
      }

      const quoteBody = document.createElement('span');
      quoteBody.className = 'mood-item-quote-body';

      const quoteMeta = document.createElement('div');
      quoteMeta.className = 'mood-item-quote-meta';

      const authorToShow = quote.author && !shouldHideQuoteAuthor(quote.author) ? quote.author : '';
      if (authorToShow) {
        const quoteAuthor = document.createElement('span');
        quoteAuthor.className = 'mood-item-quote-author';
        quoteAuthor.textContent = authorToShow;
        quoteMeta.appendChild(quoteAuthor);
      }

      if (quoteMeta.childNodes.length > 0) {
        quoteBody.appendChild(quoteMeta);
      }

      if (!isMediaOnlyQuote) {
        const quoteText = document.createElement('p');
        quoteText.className = 'mood-item-quote-text';
        quoteText.textContent = quote.text;
        quoteBody.appendChild(quoteText);
      }

      if (quoteBody.childNodes.length > 0) {
        quoteWrap.appendChild(quoteBody);
      }
      content.appendChild(quoteWrap);
    }

    const text = document.createElement('p');
    text.className = 'mood-item-text';
    const previewText = mood.previewText || '';
    const previewHtml = mood.previewHtml || '';
    const hasTextPreview = Boolean(previewText.trim() || previewHtml.trim());
    const isLongPreview = isLongContent(previewText);
    if (hasTextPreview) {
      text.appendChild(buildPreviewFragment(previewText, previewHtml));
      content.appendChild(text);
    }
    if (hasTextPreview && isLongPreview) {
      text.classList.add('mood-item-text--clamped');
    }

    const isTooBigVideoPreview = previewMediaType === 'too-big-video' && Boolean(mood.image);
    const hasGalleryPreview = !hasMediaHtml && !isTooBigVideoPreview && (mood.gallery?.items.length ?? 0) > 1;
    const hasImagePreview = Boolean(mood.image);
    const isPriorityMedia = !priorityMediaClaimed && (hasMediaHtml || hasGalleryPreview || hasImagePreview);
    if (isPriorityMedia) {
      priorityMediaClaimed = true;
    }
    const isMediaOnlyVideoPreview =
      isTooBigVideoPreview && !hasTextPreview && !hasMediaHtml && !forwardedFrom && !quote;

    if (isMediaOnlyVideoPreview) {
      element.classList.add('mood-item--media-only');
      content.classList.add('mood-item-content--media-only');
    }

    if (hasMediaHtml) {
      const media = document.createElement('div');
      media.className = 'mood-item-media';
      media.innerHTML = mediaHtml;
      mediaHydrator.applyMediaHints(media, isPriorityMedia);
      content.appendChild(media);
    } else if (hasGalleryPreview) {
      const galleryData = mood.gallery;
      if (!galleryData) {
        throw new Error(`Missing mood gallery payload for mood ${mood.id}`);
      }
      const gallery = createMoodGalleryElement(galleryData, {
        variant: 'feed',
        priority: isPriorityMedia,
      });
      content.appendChild(gallery);
    } else if (mood.image) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'mood-item-thumb';
      if (isTooBigVideoPreview) {
        thumbWrap.classList.add('mood-item-thumb--video');
      }
      if (mood.imageKind === 'sticker') {
        thumbWrap.classList.add('mood-item-thumb--sticker');
      }

      const imageLayout = isTooBigVideoPreview
        ? null
        : mood.imageLayout === 'portrait' || mood.imageLayout === 'ultra-tall'
          ? mood.imageLayout
          : mood.imageLayout === 'landscape'
            ? 'landscape'
            : null;
      if (imageLayout === 'portrait') {
        thumbWrap.classList.add('mood-item-thumb--portrait');
      } else if (imageLayout === 'ultra-tall') {
        thumbWrap.classList.add('mood-item-thumb--ultra-tall');
      }

      const img = document.createElement('img');
      img.alt = '';
      if (typeof mood.imageWidth === 'number' && mood.imageWidth > 0) {
        img.width = mood.imageWidth;
      }
      if (typeof mood.imageHeight === 'number' && mood.imageHeight > 0) {
        img.height = mood.imageHeight;
      }

      const fallback = typeof mood.imageFallback === 'string' ? mood.imageFallback.trim() : '';
      if (fallback) {
        img.dataset.fallbackSrc = fallback;
        img.onerror = () => {
          if (img.dataset.fallbackApplied === '1') return;
          const fallbackSrc = img.dataset.fallbackSrc || '';
          if (!fallbackSrc) return;
          img.dataset.fallbackApplied = '1';
          mediaHydrator.applyResponsiveImage(img, fallbackSrc);
        };
      }

      const hasResolvedImageLayout = Boolean(imageLayout) || isTooBigVideoPreview;
      mediaHydrator.setImageHints(img, { priority: isPriorityMedia });
      if (!hasResolvedImageLayout) {
        img.loading = 'eager';
        if (!isPriorityMedia) {
          img.removeAttribute('fetchpriority');
        }
      }

      const thumbMarker = document.createElement('span');
      thumbMarker.style.display = 'block';
      thumbMarker.style.width = '100%';
      thumbMarker.style.minHeight = '1px';
      let thumbInserted = false;
      const insertThumb = (): void => {
        if (thumbInserted) return;
        thumbInserted = true;
        if (thumbMarker.parentNode) {
          thumbMarker.parentNode.insertBefore(thumbWrap, thumbMarker);
        }
        thumbMarker.remove();
      };

      const classifyLoadedImage = () => {
        if (!img.naturalWidth || !img.naturalHeight) return;
        if (isTooBigVideoPreview) {
          const aspectRatio = img.naturalWidth / img.naturalHeight;
          thumbWrap.style.setProperty('--mood-thumb-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
          if (aspectRatio < 0.6) {
            thumbWrap.classList.add('mood-item-thumb--video-ultra-tall');
          } else if (aspectRatio < 0.8) {
            thumbWrap.classList.add('mood-item-thumb--video-portrait');
          }
          return;
        }

        const aspectRatio = img.naturalWidth / img.naturalHeight;
        if (aspectRatio < 0.6) {
          thumbWrap.classList.add('mood-item-thumb--ultra-tall');
        } else if (aspectRatio < 0.8) {
          thumbWrap.classList.add('mood-item-thumb--portrait');
        }
      };

      const resolveUnknownLayoutThumb = (): void => {
        classifyLoadedImage();
        insertThumb();
      };
      if (!hasResolvedImageLayout) {
        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolveUnknownLayoutThumb();
        } else {
          img.addEventListener('load', resolveUnknownLayoutThumb, { once: true });
        }
      }

      if (
        isTooBigVideoPreview
        && typeof mood.imageWidth === 'number'
        && mood.imageWidth > 0
        && typeof mood.imageHeight === 'number'
        && mood.imageHeight > 0
      ) {
        thumbWrap.style.setProperty('--mood-thumb-ratio', `${mood.imageWidth} / ${mood.imageHeight}`);
        const aspectRatio = mood.imageWidth / mood.imageHeight;
        if (aspectRatio < 0.6) {
          thumbWrap.classList.add('mood-item-thumb--video-ultra-tall');
        } else if (aspectRatio < 0.8) {
          thumbWrap.classList.add('mood-item-thumb--video-portrait');
        }
      }

      thumbWrap.appendChild(img);
      if (isTooBigVideoPreview) {
        const overlay = document.createElement('div');
        overlay.className = 'mood-item-thumb-video-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'mood-item-thumb-video-label';
        label.textContent = 'Media is too big';

        const cta = document.createElement('span');
        cta.className = 'mood-item-thumb-video-cta';
        cta.textContent = 'View details';

        overlay.appendChild(label);
        overlay.appendChild(cta);
        thumbWrap.appendChild(overlay);
      }

      if (hasResolvedImageLayout) {
        content.appendChild(thumbWrap);
      } else {
        content.appendChild(thumbMarker);
      }

      if (isPriorityMedia || !hasResolvedImageLayout) {
        mediaHydrator.applyResponsiveImage(img, mood.image);
      } else {
        img.dataset.deferredSrc = mood.image;
      }

      if (!isPriorityMedia && hasResolvedImageLayout) {
        mediaHydrator.registerDeferredImage(thumbWrap, () => {
          mediaHydrator.hydrateDeferredImage(img);
        });
      }
    }

    if (isLongPreview) {
      const details = document.createElement('a');
      details.className = 'mood-item-details link';
      details.href = `/mood/${mood.id}`;
      details.textContent = 'View details';
      content.appendChild(details);
    }

    const hasReactions = mood.reactions && mood.reactions.length > 0;
    const commentsInfo = getCommentsCountInfo(mood.commentsCount);
    const hasComments = commentsInfo.count > 0;
    const reactionsWrap = document.createElement('div');
    reactionsWrap.className = 'mood-item-reactions';

    if (hasReactions) {
      (mood.reactions ?? []).forEach((reaction) => {
        const pill = document.createElement('span');
        pill.className = reaction.isPaid ? 'mood-reaction mood-reaction--paid' : 'mood-reaction';

        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'mood-reaction-emoji';
        if (reaction.isPaid) {
          emojiSpan.textContent = '⭐';
        } else if (reaction.emojiImage || reaction.emojiId) {
          const wrapper = document.createElement('span');
          wrapper.className = 'tg-emoji';
          if (reaction.emojiId) {
            wrapper.dataset.emojiId = reaction.emojiId;
          }
          if (reaction.emojiImage) {
            const img = document.createElement('img');
            img.src = reaction.emojiImage;
            img.alt = reaction.emoji || 'emoji';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.width = 16;
            img.height = 16;
            wrapper.appendChild(img);
          } else if (reaction.emoji) {
            wrapper.textContent = reaction.emoji;
          }
          emojiSpan.appendChild(wrapper);
        } else {
          emojiSpan.textContent = reaction.emoji;
        }

        const count = document.createElement('span');
        count.className = 'mood-reaction-count';
        count.textContent = reaction.count;

        pill.appendChild(emojiSpan);
        pill.appendChild(count);
        reactionsWrap.appendChild(pill);
      });
    }

    if (hasComments) {
      const commentsLabel = commentsInfo.label || String(commentsInfo.count);
      reactionsWrap.appendChild(
        commentsPopover.createIndicator({
          postId: mood.id,
          count: commentsInfo.count,
          label: commentsLabel,
        })
      );
    }

    content.appendChild(reactionsWrap);

    const expandBtn = document.createElement('a');
    expandBtn.className = 'mood-item-expand-float';
    expandBtn.href = `/mood/${mood.id}`;
    expandBtn.title = 'View full post';
    expandBtn.setAttribute('aria-label', 'View full post');
    expandBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    element.appendChild(expandBtn);

    if (mood.tag) {
      const tag = document.createElement('span');
      tag.className = 'mood-item-tag';
      tag.textContent = `#${mood.tag}`;
      content.appendChild(tag);
    }

    element.appendChild(time);
    element.appendChild(content);
    return element;
  };

  const createDateGroup = (dateKey: string): HTMLElement => {
    const group = document.createElement('div');
    group.className = 'mood-date-group';
    group.dataset.date = dateKey;

    const header = document.createElement('div');
    header.className = 'mood-date-header';

    const dateText = document.createElement('span');
    dateText.className = 'mood-date-text';
    dateText.textContent = formatDateHeader(dateKey);

    const dateLine = document.createElement('div');
    dateLine.className = 'mood-date-line';

    header.appendChild(dateText);
    header.appendChild(dateLine);

    const items = document.createElement('div');
    items.className = 'mood-date-items';

    group.appendChild(header);
    group.appendChild(items);
    return group;
  };

  const navigateToMood = (target: HTMLElement | null): void => {
    if (!target) return;
    if (target.closest('.mood-item-quote')) return;
    if (target.closest('.mood-gallery')) return;
    if (target.closest('a')) return;

    const item = target.closest('.mood-item--clickable') as HTMLElement | null;
    if (!item) return;

    const href = item.dataset.href;
    if (href) {
      window.location.href = href;
    }
  };

  const handleQuoteJump = (target: HTMLElement | null, event: Event): boolean => {
    const quoteEl = target?.closest('.mood-item-quote') as HTMLElement | null;
    if (!quoteEl) return false;
    const quoteId = quoteEl.dataset.quoteId;
    if (quoteId && scrollToMood(quoteId, { highlight: true })) {
      event.preventDefault();
      event.stopPropagation();
    }
    return true;
  };

  const bindInteractions = (): void => {
    if (interactionsBound) return;
    interactionsBound = true;

    list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (handleQuoteJump(target, event)) return;
      navigateToMood(target);
    });

    list.addEventListener('keydown', (event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('a')) return;
      event.preventDefault();
      navigateToMood(target);
    });
  };

  const appendMoods = (posts: MoodData[], startIndex = 0): number => {
    const grouped = new Map<string, MoodData[]>();

    posts.forEach((post) => {
      const dateKey = formatDateKey(post.datetime);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)?.push(post);
    });

    let globalIndex = startIndex;
    const listFragment = document.createDocumentFragment();

    grouped.forEach((datePosts, dateKey) => {
      let entry = getGroupEntry(dateKey);
      let group = entry?.group ?? null;
      let itemsContainer = entry?.items ?? null;

      if (!group) {
        group = createDateGroup(dateKey);
        itemsContainer = group.querySelector<HTMLElement>('.mood-date-items');
        if (itemsContainer) {
          groupCache.set(dateKey, { group, items: itemsContainer });
        }
        listFragment.appendChild(group);
      }

      if (!itemsContainer) return;

      const itemsFragment = document.createDocumentFragment();
      datePosts.forEach((post) => {
        if (!post?.id || renderedIdSet.has(post.id)) return;
        itemsFragment.appendChild(createMoodItem(post, globalIndex));
        renderedIdSet.add(post.id);
        globalIndex += 1;
      });
      itemsContainer.appendChild(itemsFragment);
    });

    if (listFragment.childNodes.length > 0) {
      list.appendChild(listFragment);
      initMoodGalleries(list);
    }

    return globalIndex;
  };

  return {
    bindInteractions,
    appendMoods,
    scrollToMood,
  };
}
