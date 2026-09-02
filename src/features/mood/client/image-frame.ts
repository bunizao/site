/* Reveal duration must match `--mood-image-reveal` in styles/mood-image.css:
   the placeholder is removed from the DOM once the fade has finished. */
const REVEAL_MS = 260;

const initializedFrames = new WeakSet<HTMLElement>();

function getBlurLayer(frame: HTMLElement): HTMLElement | null {
  return frame.querySelector<HTMLElement>(':scope > .mood-image-blur');
}

/**
 * Whether the blur layer stays after the photo arrives.
 *
 * An estimated frame states a guessed ratio, so the photo is usually
 * letterboxed inside it and the blur is what fills the bands. Dropping it there
 * would swap a soft backdrop for a flat grey rectangle mid-scroll.
 *
 * TODO(owner): the predicate below trusts the ratio flag, but a frame marked
 * exact can still letterbox when the stored dimensions disagree with the file
 * that is actually served — mood 3796 states 368x491 and serves 333x725, and
 * its bands do hard-cut to grey today. Deciding this from the loaded image
 * instead would cover both cases:
 *
 *   const fills = Math.abs(image.naturalWidth / image.naturalHeight - frameRatio) < 0.01;
 *
 * The trade-off is cost against honesty. Reading `getBoundingClientRect()` per
 * image on load forces layout in the middle of a scrolling feed, and keeping
 * the layer keeps a decoded image alive for every letterboxed post. The flag is
 * free and usually right. Take whichever you would rather pay for.
 */
function keepsBlurLayer(frame: HTMLElement): boolean {
  return frame.classList.contains('mood-image-frame--estimated');
}

/* Lift the placeholder above the photo so it has something to dissolve out of.
   Only ever called while the photo is still in flight — see mood-image.css. */
function armBlurLayer(frame: HTMLElement): void {
  if (keepsBlurLayer(frame) || !getBlurLayer(frame)) return;
  frame.classList.add('is-blur-armed');
}

function releaseBlurLayer(frame: HTMLElement): void {
  if (keepsBlurLayer(frame)) return;

  const blur = getBlurLayer(frame);
  if (!blur) return;

  /* Never armed, so the photo is already painted over the placeholder and
     there is nothing to fade. Fading here would lift a hidden layer back into
     view just to dissolve it again. */
  if (!frame.classList.contains('is-blur-armed')) {
    blur.remove();
    return;
  }

  frame.classList.add('is-blur-revealed');
  window.setTimeout(() => {
    blur.remove();
    frame.classList.remove('is-blur-armed', 'is-blur-revealed');
  }, REVEAL_MS);
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
      releaseBlurLayer(frame);
      return;
    }

    armBlurLayer(frame);
    image.addEventListener('load', () => releaseBlurLayer(frame), { once: true });
  });
}
