import { getMoodFeedThumbnailStyle } from '@/features/mood/shared/feed-thumbnail';
import { resolveMoodImageLayout, type MoodImageLayout } from '@/features/mood/shared/image-srcset';

const initializedFrames = new WeakSet<HTMLElement>();

/* How far the archive's declared ratio may sit from the image's own before it
   is treated as wrong rather than rounded. */
const RATIO_TOLERANCE = 0.02;

/* The archive's width and height are wrong often enough to matter, and they
   arrive marked exact: a 475x800 portrait comes through declared as 3.28:1,
   and Telegram's live mirror declares a 589x1280 screenshot as 368x491. A
   frame built from the wrong number renders the image as a sliver in a grey
   letterbox. The declared ratio still reserves the box before the bytes land
   -- that is the whole point of it -- but once the image is here it is the
   authority on its own shape, and the frame takes that shape. */
function adoptNaturalRatio(frame: HTMLElement, image: HTMLImageElement): void {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return;

  const natural = width / height;
  const declared = readDeclaredRatio(frame);
  if (declared && Math.abs(natural - declared) <= declared * RATIO_TOLERANCE) return;

  if (frame.matches('.mood-item-thumb')) {
    reshapeFeedThumb(frame, width, height);
  } else if (frame.matches('[data-mood-gallery-slide]') || frame.closest('.mood-post')) {
    frame.style.setProperty('--mood-image-ratio', `${width} / ${height}`);
    frame.style.setProperty('--mood-gallery-ratio', `${width} / ${height}`);
    frame.style.setProperty('--mood-gallery-grow', natural.toFixed(4));
  } else {
    return;
  }

  frame.dataset.aspectRatio = String(natural);
  frame.classList.remove('mood-image-frame--estimated');

  // In the detail article the first two photos set the height of the whole
  // row, so a corrected ratio has to reach the gallery or the row keeps the
  // shape of the wrong number. The feed keeps its row height: a corrected
  // slide there changes width only, and nothing below it moves.
  if (frame.closest('.mood-post')
    && (frame.dataset.galleryIndex === '0' || frame.dataset.galleryIndex === '1')) {
    refreshRowLead(frame.closest<HTMLElement>('[data-mood-gallery]'));
  }
}

function readDeclaredRatio(frame: HTMLElement): number | null {
  const fromData = Number(frame.dataset.aspectRatio);
  if (Number.isFinite(fromData) && fromData > 0) return fromData;

  const [width, height] = frame.style.getPropertyValue('--mood-image-ratio').split('/').map(Number);
  return width > 0 && height > 0 ? width / height : null;
}

/* A feed thumb stays in the tall box it was declared in when the image is
   tall too. The box keeps its height cap, so a correction mostly narrows the
   thumb instead of moving the feed under the reader. Only a tall image
   declared wide, or the reverse, trades the box for another. */
function reshapeFeedThumb(frame: HTMLElement, width: number, height: number): void {
  const declared: MoodImageLayout = frame.classList.contains('mood-item-thumb--ultra-tall')
    ? 'ultra-tall'
    : frame.classList.contains('mood-item-thumb--portrait') ? 'portrait' : 'landscape';
  const natural = resolveMoodImageLayout(null, width, height) ?? 'landscape';
  const layout = declared !== 'landscape' && natural !== 'landscape' ? declared : natural;

  frame.classList.toggle('mood-item-thumb--portrait', layout === 'portrait');
  frame.classList.toggle('mood-item-thumb--ultra-tall', layout === 'ultra-tall');
  frame.setAttribute('style', getMoodFeedThumbnailStyle({ imageWidth: width, imageHeight: height, imageLayout: layout }));
}

/* Mirrors getMoodGalleryRowLead for a gallery whose ratios have been corrected
   in the browser. Kept to the two photos that decide where the cut lands. */
const GALLERY_PEEK = 0.5;

function refreshRowLead(gallery: HTMLElement | null): void {
  if (!gallery) return;

  const [first, second] = [...gallery.querySelectorAll<HTMLElement>('[data-mood-gallery-slide]')]
    .slice(0, 2)
    .map((slide) => Number(slide.dataset.aspectRatio));
  if (!first || !second) return;

  const span = first + GALLERY_PEEK * second;
  if (span > 0) gallery.style.setProperty('--mood-gallery-lead', (1 / span).toFixed(4));
}

function releaseBlurLayer(frame: HTMLElement): void {
  if (frame.classList.contains('mood-image-frame--estimated')) return;
  frame.querySelector(':scope > .mood-image-blur')?.remove();
}

export function initMoodImageFrames(root: ParentNode = document): void {
  const frames = [
    ...(root instanceof HTMLElement && root.matches('[data-mood-image-frame]') ? [root] : []),
    ...root.querySelectorAll<HTMLElement>('[data-mood-image-frame]'),
  ];

  frames.forEach((frame) => {
    if (initializedFrames.has(frame)) return;

    const image = frame.querySelector<HTMLImageElement>(':scope > [data-mood-image-main]');
    if (!image) return;

    initializedFrames.add(frame);
    if (image.complete && image.naturalWidth > 0) {
      adoptNaturalRatio(frame, image);
      releaseBlurLayer(frame);
      return;
    }

    image.addEventListener('load', () => {
      adoptNaturalRatio(frame, image);
      releaseBlurLayer(frame);
    }, { once: true });
  });
}
