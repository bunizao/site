import type { ChannelInfo } from '@/features/mood/client/feed-types';
import { buildArchiveSrcSet, getMoodFeedThumbSizes } from '@/features/mood/shared/image-srcset';
import { initMoodImageFrames } from '@/features/mood/client/image-frame';

interface AnimatedEmojiHydrator {
  hydrate(root?: ParentNode): Promise<void>;
}

interface ImageHintOptions {
  priority?: boolean;
  lazy?: boolean;
}

interface FeedMediaHydrator {
  setImageHints(img: HTMLImageElement, options?: ImageHintOptions): void;
  applyMediaHints(root: HTMLElement, priority?: boolean): void;
  hydrateDeferredImage(img: HTMLImageElement): void;
  registerDeferredImage(target: Element, hydrate: () => void): void;
  applyResponsiveImage(img: HTMLImageElement, src: string): void;
  attachImageFallback(img: HTMLImageElement): void;
  hydrateHero(channel: ChannelInfo): void;
}

export function createFeedMediaHydrator(
  animatedEmoji: AnimatedEmojiHydrator
): FeedMediaHydrator {
  const deferredImageRootMargin = '600px 0px';
  let deferredImageObserver: IntersectionObserver | null = null;
  const deferredImageHydrators = new WeakMap<Element, () => void>();

  const setImageHints = (
    img: HTMLImageElement,
    options: ImageHintOptions = {}
  ): void => {
    const { priority = false, lazy = true } = options;
    if (!img.getAttribute('decoding')) {
      img.decoding = 'async';
    }
    if (priority) {
      img.loading = 'eager';
      img.setAttribute('fetchpriority', 'high');
      return;
    }
    if (lazy && !img.getAttribute('loading')) {
      img.loading = 'lazy';
    }
  };

  const hydrateLazyVideo = (video: HTMLVideoElement): boolean => {
    if (video.dataset.moodVideoHydrated === '1') return true;

    let hydrated = false;
    const videoSrc = video.dataset.moodVideoSrc;
    if (videoSrc) {
      video.src = videoSrc;
      delete video.dataset.moodVideoSrc;
      hydrated = true;
    }

    video.querySelectorAll<HTMLSourceElement>('source[data-mood-video-src]').forEach((source) => {
      const sourceSrc = source.dataset.moodVideoSrc;
      if (!sourceSrc) return;
      source.src = sourceSrc;
      delete source.dataset.moodVideoSrc;
      hydrated = true;
    });

    video.dataset.moodVideoHydrated = '1';
    if (hydrated) {
      video.preload = 'metadata';
      video.load();
      return true;
    }

    return Boolean(video.currentSrc || video.src);
  };

  const shouldAutoplayVideo = (video: HTMLVideoElement): boolean =>
    'moodAutoplay' in video.dataset || video.hasAttribute('data-mood-autoplay');

  let lazyVideoObserver: IntersectionObserver | null = null;
  const observedLazyVideos = new WeakSet<HTMLVideoElement>();

  const getLazyVideoObserver = (): IntersectionObserver | null => {
    if (!('IntersectionObserver' in window)) {
      return null;
    }

    if (lazyVideoObserver) {
      return lazyVideoObserver;
    }

    lazyVideoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const video = entry.target as HTMLVideoElement;
          hydrateLazyVideo(video);
          lazyVideoObserver?.unobserve(video);
        });
      },
      { rootMargin: '25% 0px' }
    );

    return lazyVideoObserver;
  };

  let autoplayVideoObserver: IntersectionObserver | null = null;
  const observedAutoplayVideos = new WeakSet<HTMLVideoElement>();

  const getAutoplayVideoObserver = (): IntersectionObserver | null => {
    if (!('IntersectionObserver' in window)) {
      return null;
    }

    if (autoplayVideoObserver) {
      return autoplayVideoObserver;
    }

    autoplayVideoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (!entry.isIntersecting) {
          video.pause();
          return;
        }

        if (!hydrateLazyVideo(video)) return;
        video.muted = true;
        video.play().catch(() => {});
      });
    });

    return autoplayVideoObserver;
  };

  const observeLazyVideo = (video: HTMLVideoElement): void => {
    const hasDeferredSource = Boolean(video.dataset.moodVideoSrc)
      || video.querySelector('source[data-mood-video-src]');
    if (hasDeferredSource && !observedLazyVideos.has(video)) {
      video.preload = 'none';
      observedLazyVideos.add(video);
      const observer = getLazyVideoObserver();
      if (observer) {
        observer.observe(video);
      } else {
        hydrateLazyVideo(video);
      }
    }

    if (!shouldAutoplayVideo(video) || observedAutoplayVideos.has(video)) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const autoplayObserver = getAutoplayVideoObserver();
    if (!autoplayObserver) return;

    observedAutoplayVideos.add(video);
    autoplayObserver.observe(video);
  };

  const applyMediaHints = (root: HTMLElement, priority = false): void => {
    root.querySelectorAll('img').forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return;
      setImageHints(node, { priority });
      attachImageFallback(node);
      if (node.dataset.deferredSrc && node.dataset.deferredHydrated !== '1') {
        const target = node.closest('.mood-item-thumb, [data-mood-image-frame]') ?? node;
        registerDeferredImage(target, () => hydrateDeferredImage(node));
      }
    });

    root.querySelectorAll('iframe').forEach((node) => {
      if (!(node instanceof HTMLIFrameElement)) return;
      if (!node.getAttribute('loading')) {
        node.loading = 'lazy';
      }
    });

    root.querySelectorAll('video').forEach((node) => {
      if (!(node instanceof HTMLVideoElement)) return;
      observeLazyVideo(node);
      const classify = () => {
        const w = node.videoWidth;
        const h = node.videoHeight;
        if (!w || !h) return;
        const ratio = w / h;
        if (ratio < 0.6) {
          node.classList.add('video--ultra-tall');
        } else if (ratio < 0.8) {
          node.classList.add('video--portrait');
        }
      };
      if (node.readyState >= 1) {
        classify();
      } else {
        node.addEventListener('loadedmetadata', classify, { once: true });
      }
    });

    initMoodImageFrames(root);
  };

  const hydrateDeferredImage = (img: HTMLImageElement): void => {
    if (img.dataset.deferredHydrated === '1') return;
    const src = img.dataset.deferredSrc || '';
    if (!src) return;

    img.dataset.deferredHydrated = '1';
    hydrateResponsiveImage(img, src);
  };

  // Feed thumbnails carry their layout as wrapper classes (set by the
  // renderer); contained layouts get a narrower `sizes` so the browser fetches
  // the variant it will actually paint instead of a column-width one.
  const getThumbSizes = (img: HTMLImageElement): string => {
    const thumb = img.closest('.mood-item-thumb');
    if (!thumb) return getMoodFeedThumbSizes(null);
    const imageWidth = Number(img.getAttribute('width')) || null;
    const imageHeight = Number(img.getAttribute('height')) || null;
    if (thumb.classList.contains('mood-item-thumb--sticker')) {
      return getMoodFeedThumbSizes(null, 'sticker');
    }
    if (thumb.classList.contains('mood-item-thumb--ultra-tall')) {
      return getMoodFeedThumbSizes('ultra-tall', 'image', imageWidth, imageHeight);
    }
    if (thumb.classList.contains('mood-item-thumb--portrait')) {
      return getMoodFeedThumbSizes('portrait', 'image', imageWidth, imageHeight);
    }
    return getMoodFeedThumbSizes(null);
  };

  const hydrateResponsiveImage = (img: HTMLImageElement, src: string): void => {
    img.src = src;
    // Archive URLs get width negotiation; anything else (external, legacy, or a
    // non-archive fallback swap) must clear stale srcset/sizes so the browser
    // uses the plain src.
    const responsive = buildArchiveSrcSet(src, { sizes: getThumbSizes(img) });
    if (responsive.srcset) {
      img.srcset = responsive.srcset;
      if (responsive.sizes) {
        img.sizes = responsive.sizes;
      } else {
        img.removeAttribute('sizes');
      }
    } else {
      img.removeAttribute('srcset');
      img.removeAttribute('sizes');
    }
  };

  // Swap to the fallback URL once when the primary source fails to load. Shared
  // by the client renderer and SSR feed images so both recover the same way.
  const attachImageFallback = (img: HTMLImageElement): void => {
    const fallback = img.dataset.fallbackSrc?.trim() || '';
    if (!fallback || img.dataset.fallbackWired === '1') return;

    img.dataset.fallbackWired = '1';
    img.addEventListener('error', () => {
      if (img.dataset.fallbackApplied === '1') return;
      const fallbackSrc = img.dataset.fallbackSrc?.trim() || '';
      if (!fallbackSrc) return;
      img.dataset.fallbackApplied = '1';
      hydrateResponsiveImage(img, fallbackSrc);
    });
  };

  const getDeferredImageObserver = (): IntersectionObserver | null => {
    if (!('IntersectionObserver' in window)) {
      return null;
    }

    if (deferredImageObserver) {
      return deferredImageObserver;
    }

    deferredImageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          deferredImageObserver?.unobserve(entry.target);
          const hydrate = deferredImageHydrators.get(entry.target);
          deferredImageHydrators.delete(entry.target);
          hydrate?.();
        });
      },
      {
        rootMargin: deferredImageRootMargin,
      }
    );

    return deferredImageObserver;
  };

  const registerDeferredImage = (target: Element, hydrate: () => void): void => {
    const observer = getDeferredImageObserver();
    if (!observer) {
      hydrate();
      return;
    }

    deferredImageHydrators.set(target, hydrate);
    observer.observe(target);
  };

  const hydrateHero = (channel: ChannelInfo): void => {
    const heroEl = document.querySelector('[data-mood-hero]');
    if (!heroEl) return;

    const avatarEl = heroEl.querySelector('[data-hero-avatar]');
    const titleEl = heroEl.querySelector('[data-hero-title]');
    const descEl = heroEl.querySelector('[data-hero-description]');

    if (avatarEl && channel.avatar) {
      const existingImage = avatarEl.querySelector('img');
      if (existingImage) {
        avatarEl.classList.add('is-loaded');
      } else {
        const img = document.createElement('img');
        img.src = channel.avatar;
        img.alt = channel.title || 'Channel avatar';
        img.className = 'mood-hero-avatar-img';
        setImageHints(img, { lazy: false });
        img.onload = () => {
          avatarEl.classList.add('is-loaded');
        };
        avatarEl.appendChild(img);
      }
    } else if (avatarEl) {
      avatarEl.classList.add('is-loaded');
    }

    if (titleEl) {
      if (!titleEl.classList.contains('is-loaded')) {
        if (channel.titleHTML) {
          titleEl.innerHTML = channel.titleHTML;
          void animatedEmoji.hydrate(titleEl);
        } else if (channel.title) {
          titleEl.textContent = channel.title;
        }
      }

      if (channel.emojiId && !titleEl.querySelector('.mood-hero-emoji[data-emoji-id]')) {
        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'tg-emoji mood-hero-emoji';
        emojiSpan.dataset.emojiId = channel.emojiId;
        const img = document.createElement('img');
            img.src = `/static/https:/t.me/i/emoji/${channel.emojiId}.webp`;
        img.alt = 'emoji';
        setImageHints(img, { lazy: false });
        emojiSpan.appendChild(img);
        titleEl.appendChild(emojiSpan);
        void animatedEmoji.hydrate(titleEl);
      }

      titleEl.classList.add('is-loaded');
    }

    if (descEl) {
      if (!descEl.classList.contains('is-loaded')) {
        if (channel.descriptionHTML) {
          descEl.innerHTML = channel.descriptionHTML;
          void animatedEmoji.hydrate(descEl);
        } else if (channel.description) {
          descEl.textContent = channel.description;
        }
      }
      descEl.classList.add('is-loaded');
    }

    heroEl.classList.add('is-loaded');

    // Keep the docked navbar identity (MoodNavbar) fed from the same channel
    // data so the compact echo matches the hero once it docks in.
    const navAvatar = document.querySelector<HTMLImageElement>('[data-mood-nav-avatar-img]');
    if (navAvatar && channel.avatar) {
      if (navAvatar.getAttribute('src') !== channel.avatar) {
        navAvatar.src = channel.avatar;
      }
      navAvatar.hidden = false;
    }

    const navTitle = document.querySelector<HTMLElement>('[data-mood-nav-title]');
    if (navTitle && navTitle.dataset.moodNavTitleReady !== 'true') {
      if (channel.titleHTML) {
        navTitle.innerHTML = channel.titleHTML;
        navTitle.dataset.moodNavTitleReady = 'true';
        void animatedEmoji.hydrate(navTitle);
      } else if (channel.title) {
        navTitle.textContent = channel.title;
        navTitle.dataset.moodNavTitleReady = 'true';
      }
    }
  };

  return {
    setImageHints,
    applyMediaHints,
    hydrateDeferredImage,
    registerDeferredImage,
    applyResponsiveImage: hydrateResponsiveImage,
    attachImageFallback,
    hydrateHero,
  };
}
