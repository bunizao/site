import { createMoodGalleryElement, initMoodGalleries } from '@/features/mood/client/gallery';
import {
  getMoodDetailHref,
  getMoodFeedAnchorFragmentId,
  getMoodFeedAnchorHref,
  MOOD_FEED_RETURN_ANCHOR_STORAGE_KEY,
} from '@/features/mood/shared/feed-anchor';
import { buildMoodPreviewFragment } from '@/features/mood/shared/preview';
import { findTooBigVideoMedia, renderStructuredMoodFeedMediaMarkup } from '@/features/mood/shared/feed-media';
import { getMoodFeedThumbnailStyle } from '@/features/mood/shared/feed-thumbnail';
import { getMoodReactionKey } from '@/features/mood/client/meta-patcher';
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
  prependMoods(posts: MoodData[], startIndex?: number): number;
  scrollToMood(id: string, options?: { behavior?: ScrollBehavior; highlight?: boolean }): boolean;
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

function isPositiveDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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

function getMoodDetailIdFromHref(href: string): string {
  if (!href) return '';
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return '';
    const match = url.pathname.match(/^\/mood\/([1-9]\d{0,19})\/?$/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

function shouldTrackClickForCurrentTab(event: MouseEvent): boolean {
  return (
    event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
  );
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
      }, 1800);
    });
  };

  const scrollToMood = (id: string, options: { behavior?: ScrollBehavior; highlight?: boolean } = {}): boolean => {
    const target = Array.from(list.querySelectorAll<HTMLElement>('[data-mood-id]')).find(
      (item) => item.dataset.moodId === id
    ) ?? null;
    if (!target) return false;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({
      behavior: options.behavior ?? (prefersReducedMotion ? 'auto' : 'smooth'),
      block: 'center',
    });
    if (options.highlight) {
      highlightMood(target);
    }
    return true;
  };

  const createMoodItem = (mood: MoodData, index: number): HTMLElement => {
    const detailHref = getMoodDetailHref(mood.id);
    const mediaHtml = typeof mood.mediaHtml === 'string' ? mood.mediaHtml.trim() : '';
    const hasMediaHtml = mediaHtml.length > 0;
    const tooBigVideoMedia = findTooBigVideoMedia(mood.media);
    const feedMedia = tooBigVideoMedia ? mood.media?.filter((item) => item !== tooBigVideoMedia) : mood.media;
    const structuredMediaHtml = renderStructuredMoodFeedMediaMarkup(feedMedia, { lazyVideo: true });
    const hasStructuredMedia = structuredMediaHtml.length > 0;
    const previewMediaType = typeof mood.previewMediaType === 'string' ? mood.previewMediaType.trim() : '';
    const needsDetailPage = typeof mood.needsDetailPage === 'boolean'
      ? mood.needsDetailPage
      : isLongContent(mood.previewText);
    const shouldLink = needsDetailPage && !hasMediaHtml && !hasStructuredMedia;
    const element = document.createElement('div');

    if (shouldLink) {
      element.className = 'mood-item mood-item--clickable';
      element.dataset.href = detailHref;
      element.setAttribute('role', 'link');
      element.tabIndex = 0;
    } else {
      element.className = 'mood-item';
    }

    element.dataset.moodId = mood.id;
    const fragmentId = getMoodFeedAnchorFragmentId(mood.id);
    if (fragmentId) {
      element.id = fragmentId;
    }
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

    const isTooBigVideoPreview = previewMediaType === 'too-big-video' || Boolean(tooBigVideoMedia);
    const hasGalleryPreview = !hasStructuredMedia && !hasMediaHtml && !isTooBigVideoPreview && (mood.gallery?.items.length ?? 0) > 1;
    const tooBigVideoThumb = typeof tooBigVideoMedia?.thumbnailSrc === 'string' ? tooBigVideoMedia.thumbnailSrc.trim() : '';
    const imageSrc = typeof mood.image === 'string' && mood.image.trim()
      ? mood.image.trim()
      : isTooBigVideoPreview
        ? tooBigVideoThumb
        : '';
    const imageWidth = typeof mood.imageWidth === 'number' ? mood.imageWidth : tooBigVideoMedia?.width ?? null;
    const imageHeight = typeof mood.imageHeight === 'number' ? mood.imageHeight : tooBigVideoMedia?.height ?? null;
    const hasImagePreview = Boolean(imageSrc);
    const isPriorityMedia = !priorityMediaClaimed && (
      hasStructuredMedia
      || hasMediaHtml
      || hasGalleryPreview
      || hasImagePreview
      || isTooBigVideoPreview
    );
    if (isPriorityMedia) {
      priorityMediaClaimed = true;
    }
    const isMediaOnlyVideoPreview =
      isTooBigVideoPreview && !hasTextPreview && !hasStructuredMedia && !hasMediaHtml && !forwardedFrom && !quote;

    if (isMediaOnlyVideoPreview) {
      element.classList.add('mood-item--media-only');
      content.classList.add('mood-item-content--media-only');
    }

    if (hasStructuredMedia || hasMediaHtml) {
      const media = document.createElement('div');
      media.className = 'mood-item-media';
      media.innerHTML = hasStructuredMedia ? structuredMediaHtml : mediaHtml;
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
    } else if (hasImagePreview || isTooBigVideoPreview) {
      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'mood-item-thumb';
      if (isPriorityMedia) {
        thumbWrap.classList.add('mood-item-thumb--priority');
      }
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

      if (
        isTooBigVideoPreview
        && typeof imageWidth === 'number'
        && imageWidth > 0
        && typeof imageHeight === 'number'
        && imageHeight > 0
      ) {
        thumbWrap.style.setProperty('--mood-thumb-ratio', `${imageWidth} / ${imageHeight}`);
        const aspectRatio = imageWidth / imageHeight;
        if (aspectRatio < 0.6) {
          thumbWrap.classList.add('mood-item-thumb--video-ultra-tall');
        } else if (aspectRatio < 0.8) {
          thumbWrap.classList.add('mood-item-thumb--video-portrait');
        }
      }

      if (!isTooBigVideoPreview) {
        const thumbnailStyle = getMoodFeedThumbnailStyle({
          imageWidth,
          imageHeight,
          imageLayout,
          priority: isPriorityMedia,
        });
        if (thumbnailStyle) {
          thumbWrap.setAttribute('style', thumbnailStyle);
        }
      }

      const appendTooBigVideoOverlay = (): void => {
        const overlay = document.createElement('div');
        overlay.className = 'mood-item-thumb-video-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'mood-item-thumb-video-label';
        label.textContent = 'Media is too big';

        const cta = document.createElement('span');
        cta.className = 'mood-item-thumb-video-cta';
        cta.textContent = 'View details';

        const time = document.createElement('time');
        time.className = 'mood-item-thumb-video-time';
        time.dateTime = mood.datetime;
        time.textContent = formatTime(mood.datetime);

        overlay.appendChild(label);
        overlay.appendChild(cta);
        overlay.appendChild(time);
        thumbWrap.appendChild(overlay);
      };

      if (hasImagePreview) {
        const img = document.createElement('img');
        img.alt = '';
        if (typeof imageWidth === 'number' && imageWidth > 0) {
          img.width = imageWidth;
        }
        if (typeof imageHeight === 'number' && imageHeight > 0) {
          img.height = imageHeight;
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

        const hasKnownImageBox = isPositiveDimension(imageWidth) && isPositiveDimension(imageHeight);
        if (hasKnownImageBox && isTooBigVideoPreview) {
          thumbWrap.style.setProperty('--mood-thumb-ratio', `${imageWidth} / ${imageHeight}`);
        }

        const hasResolvedImageLayout = Boolean(imageLayout) || isTooBigVideoPreview || hasKnownImageBox;
        const shouldWaitForImageBeforeInsert = isPriorityMedia && !hasResolvedImageLayout;
        mediaHydrator.setImageHints(img, { priority: isPriorityMedia });

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

        thumbWrap.appendChild(img);
        if (isTooBigVideoPreview) {
          appendTooBigVideoOverlay();
        }

        if (hasResolvedImageLayout || !shouldWaitForImageBeforeInsert) {
          content.appendChild(thumbWrap);
        } else {
          content.appendChild(thumbMarker);
        }

        if (isPriorityMedia || !hasResolvedImageLayout) {
          mediaHydrator.applyResponsiveImage(img, imageSrc);
        } else {
          img.dataset.deferredSrc = imageSrc;
        }

        if (!isPriorityMedia && hasResolvedImageLayout) {
          mediaHydrator.registerDeferredImage(thumbWrap, () => {
            mediaHydrator.hydrateDeferredImage(img);
          });
        }
      } else {
        appendTooBigVideoOverlay();
        content.appendChild(thumbWrap);
      }
    }

    if (isLongPreview) {
      const details = document.createElement('a');
      details.className = 'mood-item-details link';
      details.href = detailHref;
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
        pill.dataset.moodReactionKey = getMoodReactionKey(reaction);

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
    expandBtn.href = detailHref;
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

  const rememberMoodReturnTarget = (id: string): void => {
    const returnHref = getMoodFeedAnchorHref(id);
    if (returnHref === '/mood') return;
    window.history.replaceState(window.history.state, '', returnHref);
    const target = Array.from(list.querySelectorAll<HTMLElement>('[data-mood-id]')).find(
      (item) => item.dataset.moodId === id
    );
    const top = target?.getBoundingClientRect().top ?? null;
    try {
      window.sessionStorage.setItem(
        MOOD_FEED_RETURN_ANCHOR_STORAGE_KEY,
        JSON.stringify({
          createdAt: Date.now(),
          href: returnHref,
          id,
          top: typeof top === 'number' && Number.isFinite(top) ? top : null,
        })
      );
    } catch {
      // History state still carries the semantic anchor when storage is unavailable.
    }
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
      rememberMoodReturnTarget(item.dataset.moodId ?? getMoodDetailIdFromHref(href));
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
      if (target && shouldTrackClickForCurrentTab(event as MouseEvent)) {
        const detailLink = target.closest<HTMLAnchorElement>('a[href]');
        const detailId = getMoodDetailIdFromHref(detailLink?.href ?? '');
        if (detailId) {
          rememberMoodReturnTarget(detailId);
        }
      }
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
      const insertablePosts = datePosts.filter((post) => post?.id && !renderedIdSet.has(post.id));
      if (insertablePosts.length === 0) return;

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
      insertablePosts.forEach((post) => {
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

  const prependMoods = (posts: MoodData[], startIndex = 0): number => {
    const grouped = new Map<string, MoodData[]>();

    posts.forEach((post) => {
      const dateKey = formatDateKey(post.datetime);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)?.push(post);
    });

    let insertedCount = 0;
    let globalIndex = startIndex;
    const listFragment = document.createDocumentFragment();
    const firstListChild = list.firstChild;

    grouped.forEach((datePosts, dateKey) => {
      const insertablePosts = datePosts.filter((post) => post?.id && !renderedIdSet.has(post.id));
      if (insertablePosts.length === 0) return;

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
      insertablePosts.forEach((post) => {
        itemsFragment.appendChild(createMoodItem(post, globalIndex));
        renderedIdSet.add(post.id);
        globalIndex += 1;
        insertedCount += 1;
      });
      itemsContainer.insertBefore(itemsFragment, itemsContainer.firstChild);
    });

    if (listFragment.childNodes.length > 0) {
      list.insertBefore(listFragment, firstListChild);
    }

    if (insertedCount > 0) {
      initMoodGalleries(list);
    }

    return insertedCount;
  };

  return {
    bindInteractions,
    appendMoods,
    prependMoods,
    scrollToMood,
  };
}
