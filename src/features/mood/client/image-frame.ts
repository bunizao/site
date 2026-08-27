const initializedFrames = new WeakSet<HTMLElement>();

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
      releaseBlurLayer(frame);
      return;
    }

    image.addEventListener('load', () => releaseBlurLayer(frame), { once: true });
  });
}
