import justifiedLayout from 'justified-layout';
import {
  renderMoodGalleryMarkup,
  type MoodGallery,
  type MoodGalleryVariant,
} from '@/features/mood/shared/gallery';

interface CreateMoodGalleryElementOptions {
  variant: MoodGalleryVariant;
  priority?: boolean;
}

interface GalleryController {
  containerObserver: IntersectionObserver | null;
  cleanupTrack: (() => void) | null;
}

const galleryControllers = new Map<HTMLElement, GalleryController>();
let galleryCleanupObserver: MutationObserver | null = null;

function disconnectMoodGallery(gallery: HTMLElement): void {
  const controller = galleryControllers.get(gallery);
  if (!controller) return;

  controller.containerObserver?.disconnect();
  controller.cleanupTrack?.();
  galleryControllers.delete(gallery);
}

function ensureGalleryCleanupObserver(): void {
  if (galleryCleanupObserver || typeof MutationObserver === 'undefined') {
    return;
  }

  galleryCleanupObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;

        if (galleryControllers.has(node)) {
          disconnectMoodGallery(node);
        }

        node.querySelectorAll<HTMLElement>('[data-mood-gallery]').forEach((gallery) => {
          disconnectMoodGallery(gallery);
        });
      });
    });
  });

  if (document.body) {
    galleryCleanupObserver.observe(document.body, { childList: true, subtree: true });
  }
}

function applyFallbackImage(img: HTMLImageElement): void {
  if (img.dataset.fallbackApplied === '1') return;

  const fallbackSrc = img.dataset.fallbackSrc || '';
  if (!fallbackSrc) return;

  img.dataset.fallbackApplied = '1';
  img.src = fallbackSrc;

  const fallbackSrcSet = img.dataset.fallbackSrcset || '';
  const fallbackSizes = img.dataset.sizes || '';
  if (fallbackSrcSet) {
    img.srcset = fallbackSrcSet;
    if (fallbackSizes) {
      img.sizes = fallbackSizes;
    }
  } else {
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
  }
}

function classifySlideFromImage(slide: HTMLElement, img: HTMLImageElement): void {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) return;

  slide.dataset.aspectRatio = String(width / height);
  slide.style.setProperty('--mood-gallery-ratio', `${width} / ${height}`);

  slide.classList.remove('mood-gallery-slide--portrait', 'mood-gallery-slide--ultra-tall');
  const ratio = width / height;
  if (ratio < 0.6) {
    slide.classList.add('mood-gallery-slide--ultra-tall');
    return;
  }
  if (ratio < 0.8) {
    slide.classList.add('mood-gallery-slide--portrait');
  }
}

function hydrateGalleryImage(img: HTMLImageElement): void {
  if (img.dataset.deferredHydrated === '1') return;

  const deferredSrc = img.dataset.deferredSrc || '';
  if (!deferredSrc) return;

  const slide = img.closest<HTMLElement>('[data-mood-gallery-slide]');

  img.dataset.deferredHydrated = '1';
  img.src = deferredSrc;

  const srcSet = img.dataset.deferredSrcset || '';
  const sizes = img.dataset.sizes || '';
  if (srcSet) {
    img.srcset = srcSet;
    if (sizes) {
      img.sizes = sizes;
    }
  }

  img.onerror = () => {
    applyFallbackImage(img);
  };

  const classify = () => {
    if (!slide) return;
    classifySlideFromImage(slide, img);
  };

  if (img.complete) {
    classify();
  } else {
    img.addEventListener('load', classify, { once: true });
  }
}

function hydrateSlideAtIndex(slides: HTMLElement[], index: number): void {
  const slide = slides[index];
  if (!slide) return;
  const img = slide.querySelector<HTMLImageElement>('[data-mood-gallery-image]');
  if (!img) return;

  hydrateGalleryImage(img);
}

function getDetailTargetRowHeight(trackWidth: number, slides: HTMLElement[]): number {
  const aspectTotal = slides.reduce((sum, slide) => {
    const ratio = Number.parseFloat(slide.dataset.aspectRatio ?? '');
    return Number.isFinite(ratio) && ratio > 0 ? sum + ratio : sum + 1;
  }, 0);
  const desiredRows = slides.length <= 3 ? 1 : Math.ceil(slides.length / 3);
  const rowAspect = Math.max(aspectTotal / desiredRows, 1);
  const minHeight = trackWidth >= 1024 ? 260 : 180;
  const maxHeight = trackWidth >= 1440 ? 520 : trackWidth >= 1200 ? 460 : trackWidth >= 1024 ? 400 : 340;
  return Math.max(minHeight, Math.min(maxHeight, Math.round(trackWidth / rowAspect)));
}

function applyDetailJustifiedLayout(track: HTMLElement, slides: HTMLElement[]): void {
  const trackWidth = Math.floor(track.clientWidth);
  if (trackWidth <= 0) return;

  const geometry = justifiedLayout(
    slides.map((slide) => {
      const img = slide.querySelector<HTMLImageElement>('[data-mood-gallery-image]');
      const naturalWidth = img?.naturalWidth ?? 0;
      const naturalHeight = img?.naturalHeight ?? 0;
      const width = naturalWidth > 0 ? naturalWidth : Number.parseFloat(img?.getAttribute('width') ?? '');
      const height = naturalHeight > 0 ? naturalHeight : Number.parseFloat(img?.getAttribute('height') ?? '');
      const aspectRatio = Number.parseFloat(slide.dataset.aspectRatio ?? '');

      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        return { width, height };
      }

      return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
    }),
    {
      containerWidth: trackWidth,
      containerPadding: 0,
      boxSpacing: {
        horizontal: trackWidth >= 1024 ? 18 : trackWidth >= 640 ? 16 : 14,
        vertical: trackWidth >= 1024 ? 18 : trackWidth >= 640 ? 16 : 14,
      },
      targetRowHeight: getDetailTargetRowHeight(trackWidth, slides),
      targetRowHeightTolerance: 0.22,
      showWidows: true,
      widowLayoutStyle: 'left',
    }
  );

  track.style.height = `${Math.ceil(geometry.containerHeight)}px`;
  track.dataset.moodGalleryLayout = 'justified';

  geometry.boxes.forEach((box, index) => {
    const slide = slides[index];
    const img = slide?.querySelector<HTMLImageElement>('[data-mood-gallery-image]');
    if (!slide || !img) return;

    slide.style.left = `${Math.round(box.left)}px`;
    slide.style.top = `${Math.round(box.top)}px`;
    slide.style.width = `${Math.round(box.width)}px`;
    slide.style.height = `${Math.round(box.height)}px`;
    img.style.width = '100%';
    img.style.height = '100%';
  });
}

function initMoodGallery(gallery: HTMLElement): void {
  if (gallery.dataset.moodGalleryInitialized === '1') {
    return;
  }

  gallery.dataset.moodGalleryInitialized = '1';

  const variant = (gallery.dataset.moodGalleryVariant as MoodGalleryVariant | undefined) ?? 'feed';
  const priority = gallery.dataset.moodGalleryPriority === 'true';
  const track = gallery.querySelector<HTMLElement>('[data-mood-gallery-track]');
  if (!track) {
    return;
  }

  const slides = Array.from(track.querySelectorAll<HTMLElement>('[data-mood-gallery-slide]'));
  if (!slides.length) {
    return;
  }

  const isFeed = variant === 'feed';

  function nudgeTrack(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (track.dataset.nudged === '1') return;
    track.dataset.nudged = '1';

    window.setTimeout(() => {
      const peakOffset = 28;
      const outMs = 240;
      const backMs = 400;
      const startTime = performance.now();

      const originalSnap = track.style.scrollSnapType;
      track.style.scrollSnapType = 'none';

      const animate = (now: number): void => {
        const elapsed = now - startTime;
        if (elapsed <= outMs) {
          const t = elapsed / outMs;
          const eased = 1 - Math.pow(1 - t, 2);
          track.scrollLeft = Math.round(peakOffset * eased);
          requestAnimationFrame(animate);
        } else if (elapsed <= outMs + backMs) {
          const t = (elapsed - outMs) / backMs;
          const eased = Math.pow(1 - t, 2);
          track.scrollLeft = Math.round(peakOffset * eased);
          requestAnimationFrame(animate);
        } else {
          track.scrollLeft = 0;
          track.style.scrollSnapType = originalSnap;
        }
      };

      requestAnimationFrame(animate);
    }, 500);
  }

  const startTrackWatcher = (): void => {
    const existing = galleryControllers.get(gallery);
    if (existing?.cleanupTrack) {
      return;
    }

    let rafId = 0;
    const onScroll = (): void => {
      if (rafId) return;

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const left = track.scrollLeft;
        const right = left + track.clientWidth;

        slides.forEach((slide, index) => {
          const slideLeft = slide.offsetLeft;
          const slideRight = slideLeft + slide.offsetWidth;
          const isVisible = slideRight > left && slideLeft < right;
          if (!isVisible) return;

          hydrateSlideAtIndex(slides, index - 1);
          hydrateSlideAtIndex(slides, index);
          hydrateSlideAtIndex(slides, index + 1);
        });

      });
    };

    track.addEventListener('scroll', onScroll, { passive: true });

    // ─── Wheel-to-scroll (desktop only): redirect vertical wheel to horizontal ───
    let wheelRafId = 0;
    let pendingDelta = 0;
    let snapTimer = 0;

    const onWheel = (event: WheelEvent): void => {
      if (window.matchMedia('(hover: none)').matches) return;

      const absDx = Math.abs(event.deltaX);
      const absDy = Math.abs(event.deltaY);
      if (absDx >= absDy) return; // horizontal trackpad swipe — let CSS handle it

      const maxScroll = track.scrollWidth - track.clientWidth;
      const atLeft = track.scrollLeft <= 1;
      const atRight = track.scrollLeft >= maxScroll - 1;

      if ((event.deltaY < 0 && atLeft) || (event.deltaY > 0 && atRight)) return;

      event.preventDefault();

      // Disable scroll-snap while wheel is active so scrollLeft tracks delta freely
      if (!track.dataset.wheeling) {
        track.dataset.wheeling = '1';
        track.style.scrollSnapType = 'none';
      }

      pendingDelta += event.deltaY;

      if (!wheelRafId) {
        wheelRafId = requestAnimationFrame(() => {
          wheelRafId = 0;
          track.scrollLeft = Math.max(0, Math.min(maxScroll, track.scrollLeft + pendingDelta));
          pendingDelta = 0;
        });
      }

      // After gesture ends, re-enable snap and settle to nearest slide
      clearTimeout(snapTimer);
      snapTimer = window.setTimeout(() => {
        delete track.dataset.wheeling;
        track.style.scrollSnapType = '';
        const firstSlide = slides[0];
        if (!firstSlide) return;
        const gap = Number.parseFloat(window.getComputedStyle(track).gap) || 0;
        const slideStep = firstSlide.offsetWidth + gap;
        const nearestIndex = Math.round(track.scrollLeft / slideStep);
        track.scrollTo({ left: nearestIndex * slideStep, behavior: 'smooth' });
      }, 150);
    };

    gallery.addEventListener('wheel', onWheel, { passive: false });

    galleryControllers.set(gallery, {
      containerObserver: existing?.containerObserver ?? null,
      cleanupTrack: () => {
        if (rafId) window.cancelAnimationFrame(rafId);
        if (wheelRafId) window.cancelAnimationFrame(wheelRafId);
        clearTimeout(snapTimer);
        track.removeEventListener('scroll', onScroll);
        gallery.removeEventListener('wheel', onWheel);
      },
    });
  };

  const primeGallery = (): void => {
    hydrateSlideAtIndex(slides, 0);
    hydrateSlideAtIndex(slides, 1);
    startTrackWatcher();
  };

  if (variant === 'detail' || priority) {
    if (variant === 'detail') {
      slides.forEach((_slide, index) => {
        hydrateSlideAtIndex(slides, index);
      });

      let resizeFrame = 0;
      const relayout = (): void => {
        if (resizeFrame) {
          window.cancelAnimationFrame(resizeFrame);
        }

        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = 0;
          applyDetailJustifiedLayout(track, slides);
        });
      };

      slides.forEach((slide) => {
        const img = slide.querySelector<HTMLImageElement>('[data-mood-gallery-image]');
        if (!img) return;

        if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
          classifySlideFromImage(slide, img);
          return;
        }

        img.addEventListener('load', () => {
          classifySlideFromImage(slide, img);
          relayout();
        });
      });

      const resizeObserver = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            relayout();
          })
        : null;
      resizeObserver?.observe(track);
      window.addEventListener('resize', relayout);
      relayout();

      galleryControllers.set(gallery, {
        containerObserver: null,
        cleanupTrack: () => {
          if (resizeFrame) {
            window.cancelAnimationFrame(resizeFrame);
          }
          resizeObserver?.disconnect();
          window.removeEventListener('resize', relayout);
        },
      });
      return;
    }

    primeGallery();
    galleryControllers.set(gallery, {
      containerObserver: null,
      cleanupTrack: galleryControllers.get(gallery)?.cleanupTrack ?? null,
    });
    return;
  }

  if (!('IntersectionObserver' in window)) {
    primeGallery();
    galleryControllers.set(gallery, {
      containerObserver: null,
      cleanupTrack: galleryControllers.get(gallery)?.cleanupTrack ?? null,
    });
    return;
  }

  const containerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        containerObserver.unobserve(gallery);
        primeGallery();

        if (isFeed && slides.length > 1) {
          nudgeTrack();
        }
      });
    },
    {
      root: null,
      rootMargin: '200px 0px',
      threshold: 0.01,
    }
  );

  containerObserver.observe(gallery);
  galleryControllers.set(gallery, { containerObserver, cleanupTrack: null });
}

export function createMoodGalleryElement(
  gallery: MoodGallery,
  options: CreateMoodGalleryElementOptions,
): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = renderMoodGalleryMarkup(gallery, options).trim();
  const element = template.content.firstElementChild;

  if (!(element instanceof HTMLElement)) {
    throw new Error('Failed to create mood gallery element');
  }

  return element;
}

export function initMoodGalleries(root: ParentNode = document): void {
  ensureGalleryCleanupObserver();

  const scope =
    root instanceof HTMLElement || root instanceof DocumentFragment || root instanceof Document
      ? root
      : document;

  scope.querySelectorAll<HTMLElement>('[data-mood-gallery]').forEach((gallery) => {
    initMoodGallery(gallery);
  });
}
