import { applyResponsiveImage } from '@/lib/media/responsive-image';
import type { ChannelInfo } from '@/features/mood/client/feed-types';

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
  hydrateHero(channel: ChannelInfo): void;
}

export function createFeedMediaHydrator(
  animatedEmoji: AnimatedEmojiHydrator
): FeedMediaHydrator {
  const responsiveImageWidths = [320, 480, 640, 800, 1200];
  const thumbnailImageSizes = '(min-width: 1024px) 560px, (min-width: 640px) 480px, 180px';
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
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            const ready = hydrateLazyVideo(video);
            if (ready && shouldAutoplayVideo(video)) {
              video.muted = true;
              video.play().catch(() => {});
            }
            return;
          }

          if (shouldAutoplayVideo(video)) {
            video.pause();
          }
        });
      },
      { rootMargin: '25% 0px' }
    );

    return lazyVideoObserver;
  };

  const observeLazyVideo = (video: HTMLVideoElement): void => {
    const hasDeferredSource = Boolean(video.dataset.moodVideoSrc)
      || video.querySelector('source[data-mood-video-src]');
    if (!hasDeferredSource || observedLazyVideos.has(video)) return;

    video.preload = 'none';
    observedLazyVideos.add(video);
    const observer = getLazyVideoObserver();
    if (!observer) {
      hydrateLazyVideo(video);
      return;
    }

    observer.observe(video);
  };

  const applyMediaHints = (root: HTMLElement, priority = false): void => {
    root.querySelectorAll('img').forEach((node) => {
      if (!(node instanceof HTMLImageElement)) return;
      setImageHints(node, { priority });
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
  };

  const hydrateDeferredImage = (img: HTMLImageElement): void => {
    if (img.dataset.deferredHydrated === '1') return;
    const src = img.dataset.deferredSrc || '';
    if (!src) return;

    img.dataset.deferredHydrated = '1';
    img.src = src;
    applyResponsiveImage(img, src, thumbnailImageSizes, responsiveImageWidths);
  };

  const hydrateResponsiveImage = (img: HTMLImageElement, src: string): void => {
    img.src = src;
    applyResponsiveImage(img, src, thumbnailImageSizes, responsiveImageWidths);
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
  };

  return {
    setImageHints,
    applyMediaHints,
    hydrateDeferredImage,
    registerDeferredImage,
    applyResponsiveImage: hydrateResponsiveImage,
    hydrateHero,
  };
}
