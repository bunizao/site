const initializedFrames = new WeakSet<HTMLElement>();

/* How far the archive's declared ratio may sit from the image's own before it
   is treated as wrong rather than rounded. */
const RATIO_TOLERANCE = 0.02;

/* The archive's width and height are wrong often enough to matter, and they
   arrive marked exact: a 475x800 portrait comes through declared as 3.28:1,
   and the frame built from that renders the screenshot as a sliver in a grey
   letterbox. The declared ratio still reserves the box before the bytes land
   -- that is the whole point of it -- but once the image is here it is the
   authority on its own shape, and the gallery reflows around the truth.

   Scoped to the detail article: the feed sizes its slides against a fixed
   height and must not move under the reader. */
function adoptNaturalRatio(frame: HTMLElement, image: HTMLImageElement): void {
  if (!frame.closest('.mood-post')) return;

  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return;

  const natural = width / height;
  const declared = Number(frame.dataset.aspectRatio);
  if (Number.isFinite(declared) && declared > 0
    && Math.abs(natural - declared) <= declared * RATIO_TOLERANCE) return;

  frame.dataset.aspectRatio = String(natural);
  frame.style.setProperty('--mood-image-ratio', `${width} / ${height}`);
  frame.style.setProperty('--mood-gallery-ratio', `${width} / ${height}`);
  frame.style.setProperty('--mood-gallery-grow', natural.toFixed(4));
  frame.classList.remove('mood-image-frame--estimated');
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
