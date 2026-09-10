/* The viewer the mosaic depends on. Tiles crop, so every image has to be one
   click away from its whole self; without this the gallery would be lossy.

   It is a native <dialog>: the top layer, the backdrop, the Escape key and the
   focus trap all come from the platform, and what is left is the part that is
   actually ours -- which image, and how to reach the next one. */

interface LightboxSlide {
  src: string;
  alt: string;
}

interface Lightbox {
  open(slides: LightboxSlide[], index: number, origin: HTMLElement | null): void;
}

/* Below this a horizontal drag is a tap that wandered, not a swipe. */
const SWIPE_THRESHOLD = 48;

let lightbox: Lightbox | null = null;

function readSlides(track: HTMLElement): LightboxSlide[] {
  return Array.from(track.querySelectorAll<HTMLImageElement>('[data-mood-image-main]'))
    .map((image) => ({
      src: image.dataset.deferredSrc || image.currentSrc || image.src,
      alt: image.alt,
    }))
    .filter((slide) => Boolean(slide.src));
}

function createLightbox(): Lightbox {
  const dialog = document.createElement('dialog');
  dialog.className = 'mood-lightbox';
  dialog.innerHTML = [
    '<img class="mood-lightbox-image" data-lightbox-image alt="" decoding="async" />',
    '<button type="button" class="mood-lightbox-close" data-lightbox-close aria-label="Close">',
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>',
    '</button>',
    '<button type="button" class="mood-lightbox-step mood-lightbox-step--prev" data-lightbox-step="-1" aria-label="Previous image">',
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 5 8 12 15 19"></polyline></svg>',
    '</button>',
    '<button type="button" class="mood-lightbox-step mood-lightbox-step--next" data-lightbox-step="1" aria-label="Next image">',
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 5 16 12 9 19"></polyline></svg>',
    '</button>',
    '<p class="mood-lightbox-counter" data-lightbox-counter aria-live="polite"></p>',
  ].join('');
  document.body.append(dialog);

  const image = dialog.querySelector<HTMLImageElement>('[data-lightbox-image]')!;
  const counter = dialog.querySelector<HTMLElement>('[data-lightbox-counter]')!;
  const steps = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[data-lightbox-step]'));

  let slides: LightboxSlide[] = [];
  let index = 0;
  let origin: HTMLElement | null = null;

  function show(next: number): void {
    if (!slides.length) return;
    index = (next + slides.length) % slides.length;
    const slide = slides[index]!;
    image.src = slide.src;
    image.alt = slide.alt;
    counter.textContent = slides.length > 1 ? `${index + 1} / ${slides.length}` : '';
    dialog.classList.toggle('is-single', slides.length < 2);

    // Warm the neighbours so a step lands on a painted image rather than a gap.
    [index - 1, index + 1].forEach((neighbour) => {
      const wrapped = slides[(neighbour + slides.length) % slides.length];
      if (wrapped) new Image().src = wrapped.src;
    });
  }

  function close(): void {
    dialog.close();
  }

  dialog.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.closest('[data-lightbox-close]')) {
      close();
      return;
    }

    const step = target.closest<HTMLElement>('[data-lightbox-step]');
    if (step) {
      show(index + Number(step.dataset.lightboxStep));
      return;
    }

    // Anywhere that is not the image itself is backdrop, including the padding
    // around it -- the dialog fills the viewport, so ::backdrop never gets the
    // click.
    if (target !== image) close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    }
  });

  let touchStartX = 0;
  dialog.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches[0]?.clientX ?? 0;
  }, { passive: true });

  dialog.addEventListener('touchend', (event) => {
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    show(index + (delta < 0 ? 1 : -1));
  }, { passive: true });

  dialog.addEventListener('close', () => {
    // The page keeps its scroll position under the dialog, and the compensation
    // keeps the layout from jumping when the scrollbar goes and comes back.
    document.documentElement.style.overflow = '';
    document.documentElement.style.paddingRight = '';
    image.removeAttribute('src');
    origin?.focus({ preventScroll: true });
    origin = null;
  });

  return {
    open(nextSlides, nextIndex, nextOrigin) {
      slides = nextSlides;
      origin = nextOrigin;
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = 'hidden';
      if (scrollbar > 0) document.documentElement.style.paddingRight = `${scrollbar}px`;
      show(nextIndex);
      dialog.showModal();
      steps[0]?.blur();
    },
  };
}

export function initMoodLightbox(root: ParentNode = document): void {
  const tracks = root.querySelectorAll<HTMLElement>(
    '.mood-gallery--detail [data-mood-gallery-track]',
  );

  tracks.forEach((track) => {
    if (track.dataset.moodLightboxBound === '1') return;
    track.dataset.moodLightboxBound = '1';

    // The tiles are divs in the markup because without this script they are not
    // interactive; once it runs they are buttons in everything but tag name.
    track.querySelectorAll<HTMLElement>('[data-mood-gallery-slide]').forEach((slide) => {
      slide.tabIndex = 0;
      slide.setAttribute('role', 'button');
    });

    const activate = (target: EventTarget | null): void => {
      if (!(target instanceof HTMLElement)) return;
      const slide = target.closest<HTMLElement>('[data-mood-gallery-slide]');
      if (!slide) return;

      const slides = readSlides(track);
      if (!slides.length) return;

      lightbox ??= createLightbox();
      lightbox.open(slides, Number(slide.dataset.galleryIndex) || 0, slide);
    };

    track.addEventListener('click', (event) => activate(event.target));
    track.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate(event.target);
    });
  });
}
